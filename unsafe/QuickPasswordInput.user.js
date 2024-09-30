// ==UserScript==
// @name         Password From Phone Quick Input
// @version      1.0
// @author       SuperSafeMessage
// @match        *://*/*
// @run-at document-start
// ==/UserScript==

(function () {
    'use strict';

    const apiHost = "https://password-from-phone-proxy.maggch.workers.dev"
    async function importRSAKeyPair(publicKeyBase64) {
        let publicKey;
        // Convert the Base64-encoded public key to a binary format
        const publicKeyBinary = atob(publicKeyBase64);

        // Convert the binary data to an ArrayBuffer
        const publicKeyBuffer = new ArrayBuffer(publicKeyBinary.length);
        const publicKeyArray = new Uint8Array(publicKeyBuffer);
        for (let i = 0; i < publicKeyBinary.length; i++) {
            publicKeyArray[i] = publicKeyBinary.charCodeAt(i);
        }

        // Import the public key using SubtleCrypto.importKey
        publicKey = await window.crypto.subtle.importKey(
            'spki',
            publicKeyBuffer,
            {
                name: 'RSA-OAEP',
                hash: { name: 'SHA-256' },
            },
            true,
            ['encrypt']
        );

        return publicKey
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

    // Convert an ArrayBuffer to a Base64 string
    function arrayBufferToBase64(buffer) {
        const binary = new Uint8Array(buffer).reduce((acc, i) => acc += String.fromCharCode([i]), '');
        return btoa(binary);
    }

    // Convert a string to an ArrayBuffer
    function stringToArrayBuffer(str) {
        const encoder = new TextEncoder();
        return encoder.encode(str);
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

    // Encrypt a string using RSA-OAEP with the public key and return the result as a Base64 string
    async function encryptWithPublicKey(publicKey, plaintext) {
        const encodedPlaintext = stringToArrayBuffer(plaintext);
        const keySize = publicKey.algorithm.modulusLength / 8;
        const chunkSize = keySize - 66; // OAEP padding is 66 bytes
        const chunks = splitArrayBuffer(encodedPlaintext, chunkSize);
        const encryptedChunks = [];
        for (const chunk of chunks) {
            const encryptedChunk = await window.crypto.subtle.encrypt(
                {
                    name: 'RSA-OAEP',
                },
                publicKey,
                chunk
            );
            encryptedChunks.push(encryptedChunk);
        }
        const encrypted = concatArrayBuffers(...encryptedChunks);
        const encryptedBase64 = arrayBufferToBase64(encrypted);
        return encryptedBase64;
    }

    const receiverUrlParam = new URLSearchParams(window.location.search).get('pfp_receiver');
    if (receiverUrlParam) {
        sessionStorage.setItem('pfp_receiver', receiverUrlParam);
    }
    const receiverSession = sessionStorage.getItem('pfp_receiver');
    if (!receiverSession) return;

    // Create the shadow host
    const shadowHost = document.createElement('div');
    shadowHost.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 9999;
    `;
    document.body.appendChild(shadowHost);

    // Create shadow root
    const shadowRoot = shadowHost.attachShadow({ mode: 'closed' });

    // Create login component
    const loginComponent = document.createElement('div');
    loginComponent.innerHTML = `
        <style>
            .login-overlay {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.8);
                display: flex;
                justify-content: center;
                align-items: center;
            }
            .login-form {
                background-color: white;
                padding: 20px;
                border-radius: 5px;
            }
            input {
                display: block;
                margin: 10px 0;
                padding: 5px;
                width: 200px;
            }
        </style>
        <div class="login-overlay">
            <div class="login-form">
                <input type="text" id="username" placeholder="Username">
                <input type="password" id="password" placeholder="Password">
            </div>
        </div>
    `;

    // Append login component to shadow root
    shadowRoot.appendChild(loginComponent);
    const passwordInput = shadowRoot.getElementById('password');

    let inputChanged = false;
    async function submitPassword() {
        const password = passwordInput.value;
        const publicKey = await importRSAKeyPair(receiverSession);
        const encryptedText = await encryptWithPublicKey(publicKey, password);
        const requestUrl = new URL(`${apiHost}/send`);
        requestUrl.searchParams.set('receiver', receiverSession);
        requestUrl.searchParams.set('message', encryptedText);
        await fetch(requestUrl);
        if (password == passwordInput.value) {
            inputChanged = false;
        }
    }

    passwordInput.addEventListener("input", () => {
        inputChanged = true;
    });
    (async function () {
        while (true) {
            if (inputChanged) {
                try {
                    await submitPassword();
                } catch (e) {
                    console.error(e);
                }
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    })()

})();