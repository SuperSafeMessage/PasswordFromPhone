// ==UserScript==
// @name         Password From Phone
// @version      1.0
// @author       SuperSafeMessage
// @match        *://*/*
// @grant        GM_addElement
// ==/UserScript==

(function () {
    'use strict';
    const htmlHost = 'https://supersafemessage.github.io/PasswordFromPhone/'

    // Generate RSA key pair
    async function generateRSAKeyPair() {
        const { publicKey, privateKey } = await window.crypto.subtle.generateKey(
            {
                name: 'RSA-OAEP',
                modulusLength: 4096,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: { name: 'SHA-256' },
            },
            true,
            ['encrypt', 'decrypt']
        );
        return { publicKey, privateKey };
    }

    async function publicKeyToBase64(publicKey) {
        const exportedPublicKey = await window.crypto.subtle.exportKey(
            'spki',
            publicKey
        );
        return arrayBufferToBase64(exportedPublicKey);
    }

    // Convert an ArrayBuffer to a Base64 string
    function arrayBufferToBase64(buffer) {
        const binary = new Uint8Array(buffer).reduce((acc, i) => acc += String.fromCharCode([i]), '');
        return btoa(binary);
    }

    // Convert an ArrayBuffer to a string
    function arrayBufferToString(buffer) {
        const decoder = new TextDecoder();
        return decoder.decode(buffer);
    }

    // Convert a string to an ArrayBuffer
    function stringToArrayBuffer(str) {
        const encoder = new TextEncoder();
        return encoder.encode(str);
    }

    // Convert a Base64 string to an ArrayBuffer
    function base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const buffer = new ArrayBuffer(binary.length);
        const bufferView = new Uint8Array(buffer);
        for (let i = 0; i < binary.length; i++) {
            bufferView[i] = binary.charCodeAt(i);
        }
        return buffer;
    }

    // Split an ArrayBuffer into chunks of a given size
    function splitArrayBuffer(buffer, chunkSize) {
        const chunks = [];
        let offset = 0;
        while (offset < buffer.byteLength) {
            const chunk = buffer.slice(offset, offset + chunkSize);
            chunks.push(chunk);
            offset += chunk.byteLength;
        }
        return chunks;
    }

    // Concatenate multiple ArrayBuffers into a single ArrayBuffer
    function concatArrayBuffers(...buffers) {
        const totalLength = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const buffer of buffers) {
            result.set(new Uint8Array(buffer), offset);
            offset += buffer.byteLength;
        }
        return result.buffer;
    }

    // Decrypt a Base64-encoded string using RSA-OAEP with the private key and return the result as a string
    async function decryptWithPrivateKey(privateKey, encryptedBase64) {
        const encrypted = base64ToArrayBuffer(encryptedBase64);
        const keySize = privateKey.algorithm.modulusLength / 8;
        const chunkSize = keySize;
        const encryptedChunks = splitArrayBuffer(encrypted, chunkSize);
        const decryptedChunks = [];
        for (const encryptedChunk of encryptedChunks) {
            const decryptedChunk = await window.crypto.subtle.decrypt(
                {
                    name: 'RSA-OAEP',
                },
                privateKey,
                encryptedChunk
            );
            decryptedChunks.push(decryptedChunk);
        }
        const decrypted = concatArrayBuffers(...decryptedChunks);
        const decryptedText = arrayBufferToString(decrypted);
        return decryptedText;
    }

    let _iframe = null;
    let shadowContainer = null;
    let onReceiveMessage = null;

    async function ensureIframe() {
        if (_iframe !== null) {
            return _iframe;
        }
        shadowContainer = GM_addElement(document.body, 'div', {
            style: 'position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;'
        });

        const shadowRoot = shadowContainer.attachShadow({ mode: 'closed' });
        const { publicKey, privateKey } = await generateRSAKeyPair();
        let receiver = await publicKeyToBase64(publicKey);
        window.addEventListener('message', async function (event) {
            if (event.data.receiver === receiver) {
                const decrypted = await decryptWithPrivateKey(privateKey, event.data.message);
                onReceiveMessage(decrypted);
            }
        });
        const iframeSrc = new URL(`${htmlHost}/qrcode.html`)
        const host = new URL(window.location.href).host;
        iframeSrc.searchParams.set('receiver', receiver);
        iframeSrc.searchParams.set('host', host);
        GM_addElement(shadowRoot, 'iframe', {
            style: 'border: 1px solid #ccc; width: 256px; height: 256px; display: none;',
            src: iframeSrc.href
        });
        _iframe = shadowRoot.querySelector('iframe');
        return _iframe;
    }

    async function handleFocusEvent(event) {
        if (event.target.matches('input[type="password"]')) {
            const input = event.target;
            // find the username input before the password input
            const rect = input.getBoundingClientRect();
            const iframe = await ensureIframe();
            onReceiveMessage = (message) => {
                const parts = message.split('|PFP|');
                const username = parts[0];
                const password = parts[1];

                // Attempt to find the username field
                let usernameInput = null;
                
                // Strategy 1: Find the input field that appears right before the password field
                const allInputs = Array.from(document.querySelectorAll('input[type="text"], input[type="email"]'));
                // Get all inputs that appear before the password field in the document
                const previousInputs = allInputs.filter(inputField => {
                    return input.compareDocumentPosition(inputField) & Node.DOCUMENT_POSITION_PRECEDING;
                });
                
                // Take the last one (the one right before the password field)
                if (previousInputs.length > 0) {
                    usernameInput = previousInputs[previousInputs.length - 1];
                }
                
                // Strategy 2: Find input with common username attributes within the same form (if applicable)
                if (!usernameInput && input.form) {
                    const formInputs = input.form.querySelectorAll('input');
                    for (const formInput of formInputs) {
                        if (formInput !== input && (formInput.type === 'text' || formInput.type === 'email') && 
                            (formInput.name.toLowerCase().includes('user') || formInput.id.toLowerCase().includes('user') || formInput.autocomplete === 'username')) {
                            usernameInput = formInput;
                            break;
                        }
                    }
                }

                if (usernameInput) {
                    usernameInput.value = username;
                    var usernameEventInput = new Event('input', { bubbles: true, cancelable: true });
                    usernameInput.dispatchEvent(usernameEventInput);
                    var usernameEventChange = new Event('change', { bubbles: true, cancelable: true });
                    usernameInput.dispatchEvent(usernameEventChange);
                }

                input.value = password;
                var eventInput = new Event('input', {
                    bubbles: true,
                    cancelable: true
                });
                input.dispatchEvent(eventInput);

                var eventChange = new Event('change', {
                    bubbles: true,
                    cancelable: true
                });

                input.dispatchEvent(eventChange);
            }
            shadowContainer.style.top = `${rect.bottom + window.scrollY}px`;
            shadowContainer.style.left = `${rect.left + window.scrollX}px`;
            console.log(iframe)
            iframe.style.display = 'block';
        }
    }

    async function handleBlurEvent(event) {
        if (event.target.matches('input[type="password"]')) {
            const iframe = await ensureIframe();
            iframe.style.display = 'none';
            shadowContainer.style.top = '0';
            shadowContainer.style.left = '0';
        }
    }

    // Add event listeners to the document for focus and blur events
    document.addEventListener('focus', handleFocusEvent, true);
    document.addEventListener('blur', handleBlurEvent, true);
})();
