// Utility to convert bytes to readable format
function convertBytes(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Byte';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
}

// Show directory with multi-select checkboxes
function showDirectory(data) {
    data = data['contents'];
    document.getElementById('directory-data').innerHTML = '';
    const isTrash = getCurrentPath().startsWith('/trash');

    let html = '';

    let entries = Object.entries(data);
    let folders = entries.filter(([key, value]) => value.type === 'folder');
    let files = entries.filter(([key, value]) => value.type === 'file');

    folders.sort((a, b) => new Date(b[1].upload_date) - new Date(a[1].upload_date));
    files.sort((a, b) => new Date(b[1].upload_date) - new Date(a[1].upload_date));

    for (const [key, item] of folders) {
        html += `<tr data-path="${item.path}" data-id="${item.id}" class="body-tr folder-tr">
                    <td><input type="checkbox" class="select-item" data-id="${item.id}"></td>
                    <td><div class="td-align"><img src="static/assets/folder-solid-icon.svg">${item.name}</div></td>
                    <td><div class="td-align"></div></td>
                    <td><div class="td-align"><a data-id="${item.id}" class="more-btn"><img src="static/assets/more-icon.svg" class="rotate-90"></a></div></td>
                 </tr>`;

        html += generateMoreOptions(item, isTrash, true);
    }

    for (const [key, item] of files) {
        const size = convertBytes(item.size);
        html += `<tr data-path="${item.path}" data-id="${item.id}" data-name="${item.name}" class="body-tr file-tr">
                    <td><input type="checkbox" class="select-item" data-id="${item.id}"></td>
                    <td><div class="td-align"><img src="static/assets/file-icon.svg">${item.name}</div></td>
                    <td><div class="td-align">${size}</div></td>
                    <td><div class="td-align"><a data-id="${item.id}" class="more-btn"><img src="static/assets/more-icon.svg" class="rotate-90"></a></div></td>
                 </tr>`;

        html += generateMoreOptions(item, isTrash, false);
    }

    document.getElementById('directory-data').innerHTML = html;

    if (!isTrash) {
        document.querySelectorAll('.folder-tr').forEach(div => div.ondblclick = openFolder);
        document.querySelectorAll('.file-tr').forEach(div => div.ondblclick = openFile);
    }

    document.querySelectorAll('.more-btn').forEach(div => {
        div.addEventListener('click', function (event) {
            event.preventDefault();
            openMoreButton(div)
        });
    });
}

// Generate More Options dropdown for folders/files
function generateMoreOptions(item, isTrash, isFolder) {
    if (isTrash) {
        return `<div data-path="${item.path}" id="more-option-${item.id}" data-name="${item.name}" class="more-options">
                    <input class="more-options-focus" readonly style="height:0;width:0;border:none;position:absolute">
                    <div id="restore-${item.id}" data-path="${item.path}"><img src="static/assets/load-icon.svg"> Restore</div>
                    <hr>
                    <div id="delete-${item.id}" data-path="${item.path}"><img src="static/assets/trash-icon.svg"> Delete</div>
                </div>`;
    } else {
        let shareOrFolderShare = isFolder ? `<div id="folder-share-${item.id}"><img src="static/assets/share-icon.svg"> Share</div>` : `<div id="share-${item.id}"><img src="static/assets/share-icon.svg"> Share</div>`;
        return `<div data-path="${item.path}" id="more-option-${item.id}" data-name="${item.name}" class="more-options">
                    <input class="more-options-focus" readonly style="height:0;width:0;border:none;position:absolute">
                    <div id="rename-${item.id}"><img src="static/assets/pencil-icon.svg"> Rename</div>
                    <hr>
                    <div id="trash-${item.id}"><img src="static/assets/trash-icon.svg"> Trash</div>
                    <hr>
                    ${shareOrFolderShare}
                </div>`;
    }
}

// Handle search
document.getElementById('search-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = document.getElementById('file-search').value;
    if (query === '') {
        alert('Search field is empty');
        return;
    }
    const path = '/?path=/search_' + encodeURI(query);
    window.location = path;
});

// Load Main Page
document.addEventListener('DOMContentLoaded', function () {
    const inputs = ['new-folder-name', 'rename-name', 'file-search']
    for (let i = 0; i < inputs.length; i++) {
        document.getElementById(inputs[i]).addEventListener('input', validateInput);
    }

    if (getCurrentPath().includes('/share_')) {
        getCurrentDirectory();
    } else {
        if (getPassword() === null) {
            document.getElementById('bg-blur').style.zIndex = '2';
            document.getElementById('bg-blur').style.opacity = '0.1';
            document.getElementById('get-password').style.zIndex = '3';
            document.getElementById('get-password').style.opacity = '1';
        } else {
            getCurrentDirectory();
        }
    }
});

// Utility to get selected IDs for bulk actions
function getSelectedIDs() {
    return Array.from(document.querySelectorAll('.select-item:checked')).map(input => input.dataset.id);
}

// Example: delete selected
async function deleteSelected() {
    const ids = getSelectedIDs();
    if (ids.length === 0) {
        alert('No items selected');
        return;
    }

    if (!confirm(`Delete ${ids.length} item(s)?`)) return;

    for (const id of ids) {
        // Call your API here: /api/deleteFileFolder
        await fetch('/api/deleteFileFolder', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ password: getPassword(), path: id })
        });
    }

    alert('Selected items deleted!');
    getCurrentDirectory(); // reload
}



// Clipboard for copy/cut operations (client-side)
let CLIPBOARD = { mode: null, items: [] }; // mode: 'copy' or 'cut', items: array of ids (paths)

document.getElementById('copy-selected-btn').addEventListener('click', async () => {
    const ids = getSelectedIDs();
    if (ids.length === 0) return alert('No items selected to copy');
    CLIPBOARD.mode = 'copy';
    CLIPBOARD.items = ids;
    document.getElementById('paste-btn').disabled = false;
    alert('Copied ' + ids.length + ' item(s) to clipboard');
});

document.getElementById('cut-selected-btn').addEventListener('click', async () => {
    const ids = getSelectedIDs();
    if (ids.length === 0) return alert('No items selected to cut');
    CLIPBOARD.mode = 'cut';
    CLIPBOARD.items = ids;
    document.getElementById('paste-btn').disabled = false;
    alert('Cut ' + ids.length + ' item(s) to clipboard (use Paste to move)');
});

document.getElementById('paste-btn').addEventListener('click', async () => {
    if (!CLIPBOARD.mode || CLIPBOARD.items.length === 0) return alert('Clipboard is empty');
    // destination is current directory
    const dest = getCurrentPath();
    // send to backend for each item
    for (const id of CLIPBOARD.items) {
        const source = id; // id already holds path-like string as used elsewhere (data-path + '/' + id)
        const data = { password: getPassword(), source: source, destination: dest };
        if (CLIPBOARD.mode === 'copy') {
            const res = await postJson('/api/copyFileFolder', data);
            if (res.status !== 'ok') {
                alert('Copy failed: ' + (res.error || JSON.stringify(res)));
            }
        } else if (CLIPBOARD.mode === 'cut') {
            const res = await postJson('/api/moveFileFolder', data);
            if (res.status !== 'ok') {
                alert('Move failed: ' + (res.error || JSON.stringify(res)));
            }
        }
    }
    // clear clipboard after paste (for cut, items moved)
    CLIPBOARD = { mode: null, items: [] };
    document.getElementById('paste-btn').disabled = true;
    getCurrentDirectory();
    alert('Paste completed');
});

// Enable/disable buttons based on selection
document.addEventListener('click', function () {
    try {
        const selected = getSelectedIDs().length > 0;
        document.getElementById('delete-selected-btn').disabled = !selected;
        document.getElementById('copy-selected-btn').disabled = !selected;
        document.getElementById('cut-selected-btn').disabled = !selected;
    } catch (e) {}
});
