(function () {
    "use strict";

    const MAX_FILE_SIZE = 1250 * 1024;
    const state = {
        user: null,
        chats: [],
        chatsLoaded: false,
        selectedChat: null,
        messages: [],
        loadingMessages: false
    };

    const elements = {
        app: document.getElementById("chatApp"),
        selfName: document.getElementById("selfName"),
        selfAvatar: document.getElementById("selfAvatar"),
        contactList: document.getElementById("contactList"),
        chatCount: document.getElementById("chatCount"),
        search: document.getElementById("searchUsers"),
        contactAvatar: document.getElementById("contactAvatar"),
        contactName: document.getElementById("contactName"),
        contactStatus: document.getElementById("contactStatus"),
        chatType: document.getElementById("chatType"),
        messages: document.getElementById("chatMessages"),
        form: document.getElementById("messageForm"),
        input: document.getElementById("messageInput"),
        fileInput: document.getElementById("fileInput"),
        attachButton: document.getElementById("attachButton"),
        attachmentPreview: document.getElementById("attachmentPreview"),
        statusMessage: document.getElementById("statusMessage"),
        groupButton: document.getElementById("newGroupButton"),
        groupDialog: document.getElementById("groupDialog"),
        groupForm: document.getElementById("groupForm"),
        groupName: document.getElementById("groupName"),
        groupMembers: document.getElementById("groupMembers"),
        groupError: document.getElementById("groupError"),
        cancelGroup: document.getElementById("cancelGroup"),
        notificationButton: document.getElementById("notificationButton"),
        sendButton: document.getElementById("sendButton")
    };

    let selectedFile = null;
    let chatRefreshTimer = null;
    let messageRefreshTimer = null;
    let presenceTimer = null;
    let statusTimer = null;

    async function api(path, options) {
        const requestOptions = Object.assign({ credentials: "same-origin" }, options || {});
        if (requestOptions.body && typeof requestOptions.body !== "string") {
            requestOptions.headers = Object.assign({}, requestOptions.headers, { "Content-Type": "application/json" });
            requestOptions.body = JSON.stringify(requestOptions.body);
        }
        const response = await fetch(path, requestOptions);
        const payload = await response.json();
        if (!response.ok) {
            const error = new Error(payload.error || "Something went wrong. Please try again.");
            error.status = response.status;
            throw error;
        }
        return payload;
    }

    function showStatus(message, isError) {
        elements.statusMessage.textContent = message;
        elements.statusMessage.classList.toggle("error", Boolean(isError));
        window.clearTimeout(statusTimer);
        statusTimer = window.setTimeout(function () {
            elements.statusMessage.textContent = "Messages are stored securely in the VYBE database.";
            elements.statusMessage.classList.remove("error");
        }, 4500);
    }

    function showApp(user) {
        if (state.user && state.user.id !== user.id) {
            state.selectedChat = null;
            state.messages = [];
        }
        state.user = user;
        state.chatsLoaded = false;
        elements.selfName.textContent = user.username;
        elements.selfAvatar.textContent = user.username.charAt(0).toUpperCase();
        elements.search.value = "";
    }

    function chatKey(chat) {
        return chat.kind + "-" + chat.id;
    }

    function formatTime(timestamp) {
        return new Date(timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }

    function renderContacts() {
        const query = elements.search.value.trim().toLocaleLowerCase();
        const visibleChats = state.chats.filter(function (chat) {
            return chat.name.toLocaleLowerCase().includes(query);
        });
        elements.contactList.replaceChildren();
        elements.chatCount.textContent = String(state.chats.length);

        if (visibleChats.length === 0) {
            const empty = document.createElement("p");
            empty.className = "empty-state";
            empty.textContent = query ? "No chats found." : "Open VYBE in another browser to start chatting.";
            elements.contactList.appendChild(empty);
            return;
        }

        visibleChats.forEach(function (chat) {
            const row = document.createElement("div");
            row.className = "contact" + (state.selectedChat && chatKey(chat) === chatKey(state.selectedChat) ? " active" : "");
            row.setAttribute("role", "listitem");
            row.tabIndex = 0;
            row.setAttribute("aria-label", chat.name + (chat.kind === "group" ? ", group chat" : ""));

            const avatar = document.createElement("div");
            avatar.className = "avatar";
            avatar.setAttribute("aria-hidden", "true");
            avatar.textContent = chat.kind === "group" ? "G" : chat.name.charAt(0).toUpperCase();
            row.appendChild(avatar);

            const copy = document.createElement("div");
            copy.className = "contact-copy";
            const nameRow = document.createElement("div");
            nameRow.className = "contact-name-row";
            const name = document.createElement("h3");
            name.textContent = chat.name;
            nameRow.appendChild(name);
            if (chat.lastTime) {
                const time = document.createElement("span");
                time.className = "contact-time";
                time.textContent = formatTime(chat.lastTime);
                nameRow.appendChild(time);
            }
            const preview = document.createElement("p");
            preview.textContent = chat.preview || "Start a conversation";
            copy.append(nameRow, preview);
            row.appendChild(copy);
            row.addEventListener("click", function () { openChat(chat); });
            row.addEventListener("keydown", function (event) {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openChat(chat);
                }
            });
            elements.contactList.appendChild(row);
        });
    }

    function updateHeader(chat) {
        elements.contactAvatar.textContent = chat.kind === "group" ? "G" : chat.name.charAt(0).toUpperCase();
        elements.contactName.textContent = chat.name;
        elements.chatType.textContent = chat.kind === "group" ? "Group chat" : "Direct message";
        elements.contactStatus.replaceChildren();
        if (chat.kind === "group") {
            const count = document.createElement("span");
            count.textContent = chat.memberCount + " members";
            elements.contactStatus.appendChild(count);
        } else {
            const dot = document.createElement("span");
            dot.className = "status-dot" + (chat.online ? " online" : "");
            dot.setAttribute("aria-hidden", "true");
            const status = document.createElement("span");
            status.textContent = chat.online ? "Online" : "Offline";
            elements.contactStatus.append(dot, status);
        }
    }

    function appendAttachment(container, attachment) {
        if (!attachment || typeof attachment.data !== "string"
            || !/^data:[\w.+-]+\/[\w.+-]+;base64,[A-Za-z0-9+/=]+$/.test(attachment.data)) {
            return;
        }
        if (attachment.type && attachment.type.indexOf("image/") === 0) {
            const image = document.createElement("img");
            image.className = "message-attachment";
            image.src = attachment.data;
            image.alt = attachment.name;
            container.appendChild(image);
        } else if (attachment.type && attachment.type.indexOf("video/") === 0) {
            const video = document.createElement("video");
            video.className = "message-attachment";
            video.src = attachment.data;
            video.controls = true;
            video.preload = "metadata";
            video.setAttribute("aria-label", attachment.name);
            container.appendChild(video);
        } else {
            const link = document.createElement("a");
            link.className = "message-file";
            link.href = attachment.data;
            link.download = attachment.name;
            link.textContent = "▤ " + attachment.name;
            container.appendChild(link);
        }
    }

    function renderMessages() {
        const wasAtBottom = elements.messages.scrollHeight - elements.messages.scrollTop - elements.messages.clientHeight < 60;
        elements.messages.replaceChildren();
        if (!state.selectedChat) {
            const empty = document.createElement("p");
            empty.className = "empty-state";
            empty.textContent = "Choose a contact to start chatting.";
            elements.messages.appendChild(empty);
            return;
        }
        if (state.messages.length === 0) {
            const empty = document.createElement("p");
            empty.className = "empty-state";
            empty.textContent = "No messages yet. Say hello!";
            elements.messages.appendChild(empty);
            return;
        }

        state.messages.forEach(function (message) {
            const item = document.createElement("article");
            item.className = "message " + message.direction;
            if (state.selectedChat.kind === "group" && message.direction === "received") {
                const sender = document.createElement("span");
                sender.className = "message-sender";
                sender.textContent = message.sender;
                item.appendChild(sender);
            }
            const bubble = document.createElement("div");
            bubble.className = "message-bubble";
            if (message.text) {
                const text = document.createElement("span");
                text.textContent = message.text;
                bubble.appendChild(text);
            }
            appendAttachment(bubble, message.attachment);
            item.appendChild(bubble);
            const time = document.createElement("time");
            time.className = "message-time";
            time.dateTime = new Date(message.time).toISOString();
            time.textContent = formatTime(message.time);
            item.appendChild(time);
            elements.messages.appendChild(item);
        });
        if (wasAtBottom) {
            elements.messages.scrollTop = elements.messages.scrollHeight;
        }
    }

    async function refreshChats() {
        if (!state.user) {
            return;
        }
        try {
            const response = await api("/api/chats");
            const previousChats = state.chats;
            state.chats = response.chats;
            if (state.chatsLoaded) {
                state.chats.forEach(function (chat) {
                    const previous = previousChats.find(function (item) { return chatKey(item) === chatKey(chat); });
                    const isSelected = state.selectedChat && chatKey(state.selectedChat) === chatKey(chat);
                    if (previous && !isSelected && chat.lastMessageId
                        && chat.lastMessageId !== previous.lastMessageId
                        && chat.lastSenderId !== state.user.id) {
                        notifyMessage(chat, { text: chat.preview });
                    }
                });
            }
            state.chatsLoaded = true;
            if (state.selectedChat) {
                const updated = state.chats.find(function (chat) {
                    return chatKey(chat) === chatKey(state.selectedChat);
                });
                if (updated) {
                    state.selectedChat = updated;
                    updateHeader(updated);
                }
            }
            renderContacts();
            if (elements.groupDialog.open) {
                renderGroupMembers();
            }
        } catch (error) {
            if (error.status === 401) {
                initialize();
            } else {
                showStatus(error.message, true);
            }
        }
    }

    async function fetchMessages(isInitial) {
        if (!state.user || !state.selectedChat || state.loadingMessages) {
            return;
        }
        state.loadingMessages = true;
        const selectedKey = chatKey(state.selectedChat);
        const lastId = isInitial || state.messages.length === 0 ? 0 : state.messages[state.messages.length - 1].id;
        try {
            const response = await api("/api/chats/" + state.selectedChat.conversationId + "/messages?after=" + lastId);
            if (!state.selectedChat || selectedKey !== chatKey(state.selectedChat)) {
                return;
            }
            if (response.messages.length === 0) {
                return;
            }
            const incoming = response.messages.filter(function (message) {
                return message.direction === "received";
            });
            state.messages = state.messages.concat(response.messages);
            renderMessages();
            if (!isInitial && incoming.length > 0) {
                notifyMessage(state.selectedChat, incoming[incoming.length - 1]);
            }
        } catch (error) {
            if (error.status === 401) {
                initialize();
            } else {
                showStatus(error.message, true);
            }
        } finally {
            state.loadingMessages = false;
        }
    }

    async function openChat(chat) {
        state.selectedChat = chat;
        state.messages = [];
        renderContacts();
        updateHeader(chat);
        renderMessages();
        clearSelectedFile();
        if (chat.kind === "direct" && !chat.conversationId) {
            try {
                const result = await api("/api/chats/direct", { method: "POST", body: { user_id: chat.id } });
                chat.conversationId = result.conversationId;
                await refreshChats();
            } catch (error) {
                showStatus(error.message, true);
                return;
            }
        }
        await fetchMessages(true);
        elements.input.focus();
    }

    async function createGroup(event) {
        event.preventDefault();
        elements.groupError.textContent = "";
        const checked = Array.from(elements.groupMembers.querySelectorAll('input[type="checkbox"]:checked'));
        if (checked.length === 0) {
            elements.groupError.textContent = "Select at least one person.";
            return;
        }
        try {
            const result = await api("/api/chats/group", {
                method: "POST",
                body: {
                    name: elements.groupName.value.trim(),
                    members: checked.map(function (checkbox) { return Number(checkbox.value); })
                }
            });
            elements.groupDialog.close();
            elements.groupForm.reset();
            await refreshChats();
            const group = state.chats.find(function (chat) {
                return chat.conversationId === result.conversationId;
            });
            if (group) {
                await openChat(group);
            }
        } catch (error) {
            elements.groupError.textContent = error.message;
        }
    }

    function renderGroupMembers() {
        elements.groupMembers.replaceChildren();
        const legend = document.createElement("legend");
        legend.textContent = "Add people";
        elements.groupMembers.appendChild(legend);
        const contacts = state.chats.filter(function (chat) { return chat.kind === "direct"; });
        if (contacts.length === 0) {
            const empty = document.createElement("p");
            empty.className = "empty-state";
            empty.textContent = "Open VYBE in another browser to add people to a group.";
            elements.groupMembers.appendChild(empty);
            return;
        }
        contacts.forEach(function (contact) {
            const label = document.createElement("label");
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.value = String(contact.id);
            const name = document.createElement("span");
            name.textContent = contact.name;
            label.append(checkbox, name);
            elements.groupMembers.appendChild(label);
        });
    }

    function clearSelectedFile() {
        selectedFile = null;
        elements.fileInput.value = "";
        elements.attachmentPreview.replaceChildren();
        elements.attachmentPreview.hidden = true;
    }

    async function sendMessage(text, attachment) {
        if (!state.selectedChat) {
            showStatus("Choose a chat before sending a message.", true);
            return false;
        }
        try {
            await api("/api/chats/" + state.selectedChat.conversationId + "/messages", {
                method: "POST",
                body: { text: text.trim(), attachment: attachment || null }
            });
            elements.input.value = "";
            clearSelectedFile();
            await fetchMessages(state.messages.length === 0);
            await refreshChats();
            return true;
        } catch (error) {
            showStatus(error.message, true);
            return false;
        }
    }

    function readSelectedFile(file, text) {
        if (file.size > MAX_FILE_SIZE) {
            showStatus("Files must be 1.25 MB or smaller.", true);
            clearSelectedFile();
            return;
        }
        const reader = new FileReader();
        reader.addEventListener("load", function () {
            if (typeof reader.result !== "string") {
                showStatus("Could not read this file. Please try another file.", true);
                return;
            }
            sendMessage(text, { name: file.name, type: file.type || "application/octet-stream", data: reader.result });
        });
        reader.addEventListener("error", function () {
            showStatus("Could not read this file. Please try another file.", true);
        });
        reader.readAsDataURL(file);
    }

    function notifyMessage(chat, message) {
        if (!("Notification" in window) || Notification.permission !== "granted" || document.hasFocus()) {
            return;
        }
        const notification = new Notification(chat.name, {
            body: message.text || (message.attachment ? "Sent an attachment: " + message.attachment.name : "New message"),
            tag: "vybe-chat-" + chat.conversationId
        });
        notification.onclick = function () {
            window.focus();
            notification.close();
        };
    }

    function startPolling() {
        stopPolling();
        api("/api/presence", { method: "POST", body: {} }).catch(function (error) {
            showStatus(error.message, true);
        });
        chatRefreshTimer = window.setInterval(refreshChats, 8000);
        messageRefreshTimer = window.setInterval(function () { fetchMessages(false); }, 2000);
        presenceTimer = window.setInterval(function () {
            api("/api/presence", { method: "POST", body: {} }).catch(function (error) {
                showStatus(error.message, true);
            });
        }, 10000);
    }

    function stopPolling() {
        window.clearInterval(chatRefreshTimer);
        window.clearInterval(messageRefreshTimer);
        window.clearInterval(presenceTimer);
    }

    elements.search.addEventListener("input", renderContacts);
    elements.groupButton.addEventListener("click", function () {
        elements.groupError.textContent = "";
        elements.groupName.value = "";
        renderGroupMembers();
        elements.groupDialog.showModal();
        elements.groupName.focus();
    });
    elements.groupForm.addEventListener("submit", createGroup);
    elements.cancelGroup.addEventListener("click", function () { elements.groupDialog.close(); });
    document.getElementById("cancelGroupFooter").addEventListener("click", function () { elements.groupDialog.close(); });

    elements.form.addEventListener("submit", function (event) {
        event.preventDefault();
        if (elements.sendButton.disabled) {
            return;
        }
        elements.sendButton.disabled = true;
        const text = elements.input.value;
        if (selectedFile) {
            readSelectedFile(selectedFile, text);
            elements.sendButton.disabled = false;
        } else {
            sendMessage(text, null).finally(function () { elements.sendButton.disabled = false; });
        }
    });

    elements.attachButton.addEventListener("click", function () { elements.fileInput.click(); });
    elements.fileInput.addEventListener("change", function () {
        const file = elements.fileInput.files && elements.fileInput.files[0];
        if (!file) {
            clearSelectedFile();
            return;
        }
        const allowed = file.type.indexOf("image/") === 0 || file.type.indexOf("video/") === 0
            || /\.(pdf|docx?|txt|rtf|xlsx?|pptx?|zip)$/i.test(file.name);
        if (!allowed) {
            showStatus("Choose an image, video, or supported document.", true);
            clearSelectedFile();
            return;
        }
        selectedFile = file;
        const label = document.createElement("span");
        label.textContent = file.name;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Remove";
        remove.setAttribute("aria-label", "Remove attached file");
        remove.addEventListener("click", clearSelectedFile);
        elements.attachmentPreview.replaceChildren(label, remove);
        elements.attachmentPreview.hidden = false;
    });

    elements.notificationButton.addEventListener("click", async function () {
        if (!("Notification" in window)) {
            showStatus("Desktop notifications are not supported by this browser.", true);
            return;
        }
        const permission = await Notification.requestPermission();
        showStatus(permission === "granted" ? "Desktop notifications are enabled." : "Notification permission was not granted.", permission !== "granted");
    });

    async function initialize() {
        try {
            const response = await api("/api/me");
            showApp(response.user);
            await refreshChats();
            startPolling();
        } catch (error) {
            showStatus(error.message + " Check that the VYBE server is running.", true);
        }
    }

    initialize();
}());
