import asyncio
from pathlib import Path

from pyrogram import Client, filters
from pyrogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery
from pyromod import listen
import config
from utils.logger import Logger

logger = Logger(__name__)

START_CMD = """🚀 **Welcome To Batmans Drive's Bot Mode**

You can use this bot to upload files to your Drive website directly instead of doing it from website.

🗄 **Commands:**
/set_folder - Set folder for file uploads
/current_folder - Check current folder

📤 **How To Upload Files:** Send a file to this bot and it will be uploaded to your Drive website. You can also set a folder for file uploads using /set_folder command.

Read more about [Batman Drive's Bot Mode](https://github.com/bat-cave01/TgDrive)
"""

SET_FOLDER_PATH_CACHE = {}  # Cache to store folder path for each folder id
DRIVE_DATA = None
BOT_MODE = None

# create cache folder
session_cache_path = Path("./cache")
session_cache_path.mkdir(parents=True, exist_ok=True)

main_bot = Client(
    name="main_bot",
    api_id=config.API_ID,
    api_hash=config.API_HASH,
    bot_token=config.MAIN_BOT_TOKEN,
    sleep_threshold=config.SLEEP_THRESHOLD,
    workdir=session_cache_path,
)


# /start and /help
@main_bot.on_message(
    filters.command(["start", "help"])
    & filters.private
    & filters.user(config.TELEGRAM_ADMIN_IDS)
)
async def start_handler(client: Client, message: Message):
    await message.reply_text(START_CMD)


# /set_folder
@main_bot.on_message(
    filters.command("set_folder")
    & filters.private
    & filters.user(config.TELEGRAM_ADMIN_IDS),
)
async def set_folder_handler(client: Client, message: Message):
    global SET_FOLDER_PATH_CACHE, DRIVE_DATA

    await message.reply_text(
        "Send the folder name where you want to upload files\n\n/cancel to cancel"
    )

    try:
        response = await client.listen(
            chat_id=message.chat.id,
            filters=filters.text,
            timeout=60
        )
    except asyncio.TimeoutError:
        await message.reply_text("⏳ Timeout\n\nUse /set_folder to try again")
        return

    if response.text.lower().strip() == "/cancel":
        await message.reply_text("❌ Cancelled")
        return
    folder_name = response.text.strip()
    search_result = DRIVE_DATA.search_file_folder(folder_name)

    folders = {item.id: item for item in search_result.values() if item.type == "folder"}

    if not folders:
        await message.reply_text(f"⚠️ No folder found with name: {folder_name}")
        return

    buttons = []
    folder_cache = {}
    folder_cache_id = len(SET_FOLDER_PATH_CACHE) + 1

    for folder in folders.values():
        path = folder.path.strip("/")
        folder_path = "/" + ("/" + path + "/" + folder.id).strip("/")
        folder_cache[folder.id] = (folder_path, folder.name)
        buttons.append(
            [InlineKeyboardButton(folder.name, callback_data=f"set_folder_{folder_cache_id}_{folder.id}")]
        )

    SET_FOLDER_PATH_CACHE[folder_cache_id] = folder_cache

    await message.reply_text(
        "✅ Select the folder where you want to upload files:",
        reply_markup=InlineKeyboardMarkup(buttons),
    )


# callback for folder select
@main_bot.on_callback_query(
    filters.user(config.TELEGRAM_ADMIN_IDS) & filters.regex(r"set_folder_")
)
async def set_folder_callback(client: Client, callback_query: CallbackQuery):
    global SET_FOLDER_PATH_CACHE, BOT_MODE

    folder_cache_id, folder_id = callback_query.data.split("_")[2:]

    folder_path_cache = SET_FOLDER_PATH_CACHE.get(int(folder_cache_id))
    if folder_path_cache is None:
        await callback_query.answer("Request Expired, Send /set_folder again", show_alert=True)
        await callback_query.message.delete()
        return

    folder_path, name = folder_path_cache.get(folder_id, (None, None))
    if not folder_path:
        await callback_query.answer("Invalid folder", show_alert=True)
        return

    # clear cache
    del SET_FOLDER_PATH_CACHE[int(folder_cache_id)]
    BOT_MODE.set_folder(folder_path, name)

    await callback_query.answer(f"Folder Set Successfully To : {name}", show_alert=True)
    await callback_query.message.edit_text(
        f"✅ Folder Set Successfully To : {name}\n\nNow you can send / forward files to me and it will be uploaded to this folder."
    )


# /current_folder
@main_bot.on_message(
    filters.command("current_folder")
    & filters.private
    & filters.user(config.TELEGRAM_ADMIN_IDS)
)
async def current_folder_handler(client: Client, message: Message):
    global BOT_MODE
    await message.reply_text(f"Current Folder: {BOT_MODE.current_folder_name}")


# Handling file uploads
@main_bot.on_message(
    filters.private
    & filters.user(config.TELEGRAM_ADMIN_IDS)
    & (filters.document | filters.video | filters.audio | filters.photo | filters.sticker)
)
async def file_handler(client: Client, message: Message):
    global BOT_MODE, DRIVE_DATA

    copied_message = await message.copy(config.STORAGE_CHANNEL)
    file = copied_message.document or copied_message.video or copied_message.audio or copied_message.sticker

    # handle photos
    file_name = getattr(file, "file_name", None)
    if not file_name and copied_message.photo:
        file_name = f"photo_{copied_message.id}.jpg"

    file_size = getattr(file, "file_size", None) or 0

    DRIVE_DATA.new_file(
        BOT_MODE.current_folder,
        file_name,
        copied_message.id,
        file_size,
    )

    await message.reply_text(
        f"""✅ File Uploaded Successfully To Your Batman's Drive Website
                             
**File Name:** {file_name}
**Folder:** {BOT_MODE.current_folder_name}
"""
    )


# main entry
async def start_bot_mode(d, b):
    global DRIVE_DATA, BOT_MODE
    DRIVE_DATA = d
    BOT_MODE = b

    logger.info("Starting Main Bot")
    await main_bot.start()

    await main_bot.send_message(
        config.STORAGE_CHANNEL, "Batman's Drive Bot Mode Enabled"
    )
    logger.info("Main Bot Started")
    logger.info("TG Drive's Bot Mode Enabled")
