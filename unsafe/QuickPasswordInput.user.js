// ==UserScript==
// @name         Password From Phone Quick Input
// @version      1.1
// @author       SuperSafeMessage
// @match        *://*/*
// @run-at       document-start
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM.deleteValue
// @grant        GM.saveTab
// @grant        GM.getTab
// @grant        GM.addStyle
// @grant        GM.openInTab
// ==/UserScript==

(async function () {
    'use strict';

    const inputHtmlOrigin = 'https://supersafemessage.github.io'; // Define the origin of input.html
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

    // --- Check if running on input.html ---
    if (window.location.origin === inputHtmlOrigin && window.location.pathname.includes('input.html')) {
        console.log("QPI: Running on input.html. Setting up trigger listener.");
        window.addEventListener('message', async (event) => {
            alert("QPI: Running on input.html. Setting up trigger listener.");
            // Listen for message from self
            if (event.origin === inputHtmlOrigin && event.data && event.data.type === 'pfp_trigger_quick_input') {
                console.log("QPI (on input.html): Received trigger message.");
                const { receiver, host } = event.data;
                if (receiver && host) {
                    try {
                        await GM.setValue('current_pfp', { receiver, host });
                        console.log("QPI (on input.html): Stored receiver and host.");
                        const targetUrl = `https://${host}/`;
                        console.log(`QPI (on input.html): Opening target host: ${targetUrl}`);
                        GM.openInTab(targetUrl, false);
                    } catch (error) {
                        console.error("QPI (on input.html): Error setting GM value or opening window:", error);
                    }
                } else {
                    console.warn("QPI (on input.html): Trigger message missing receiver or host.");
                }
            }
        });
        // Stop execution for input.html, no UI needed here
        return;
    }

    // --- Code below only runs on non-input.html pages (e.g., the target host page) ---
    console.log("QPI: Running on target page. Initializing...");

    let receiverSession = null;
    let initialized = false;

    // Define CSS styles as a string
    const quickInputCSS = `
        .login-overlay-pfp {
            position: fixed; /* Use fixed to cover viewport */
            top: 0;
            left: 0;
            width: 100vw; /* Cover full viewport width */
            height: 100vh; /* Cover full viewport height */
            background-color: rgba(0, 0, 0, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 2147483647; /* Max z-index */
            pointer-events: auto;
        }
        .login-form-pfp {
            background-color: white;
            padding: 20px;
            border-radius: 5px;
        }
        .login-form-pfp input {
            display: block;
            margin: 10px 0;
            padding: 5px;
            width: 200px;
        }
    `;

    // Function to initialize the UI and logic
    async function initializeQuickInput(receivedReceiverId) {
        if (initialized) return;
        initialized = true;
        console.log("QPI: Initializing QuickInput UI with receiver ID:", receivedReceiverId);

        receiverSession = receivedReceiverId;

        // Inject CSS using GM.addStyle
        try {
            await GM.addStyle(quickInputCSS);
            console.log("QPI: Injected CSS.");
        } catch (error) {
            console.error("QPI: Failed to inject CSS:", error);
        }

        // Create login component container directly in body
        const loginComponentContainer = document.createElement('div');
        loginComponentContainer.className = 'login-overlay-pfp';
        loginComponentContainer.innerHTML = `
            <div class="login-form-pfp">
                <input type="text" id="username-pfp" placeholder="Username">
                <input type="password" id="password-pfp" placeholder="Password">
            </div>
        `;
        (document.body || document.documentElement).appendChild(loginComponentContainer);
        console.log("QPI: Appended login component to body.");

        const usernameInput = loginComponentContainer.querySelector('#username-pfp');
        const passwordInput = loginComponentContainer.querySelector('#password-pfp');

        if (!usernameInput || !passwordInput) {
             console.error("QPI: Could not find username or password input elements.");
             return;
        }

        let inputChanged = false;
        async function submitPassword() {
            if (!receiverSession) {
                console.error("QPI: Receiver ID not set in submitPassword.");
                return;
            }
            const username = usernameInput.value;
            const password = passwordInput.value;
            const combined = `${username}|PFP|${password}`;
            console.log("QPI: Submitting...");
            try {
                const publicKey = await importRSAKeyPair(receiverSession);
                const encryptedText = await encryptWithPublicKey(publicKey, combined);
                const requestUrl = new URL(`${apiHost}/send`);
                requestUrl.searchParams.set('receiver', receiverSession);
                requestUrl.searchParams.set('message', encryptedText);
                await fetch(requestUrl);
                console.log("QPI: Submitted data for receiver:", receiverSession);
                if (username == usernameInput.value && password == passwordInput.value) {
                    inputChanged = false;
                }
            } catch(e) {
                 console.error("QPI: Error during submitPassword:", e);
            }
        }

        passwordInput.addEventListener("input", () => {
            inputChanged = true;
        });
        usernameInput.addEventListener("input", () => {
            inputChanged = true;
        });

        (async function () {
            while (true) {
                if (inputChanged) {
                    try {
                        await submitPassword();
                    } catch (e) {
                        console.error("QPI: Error in submit loop:", e);
                    }
                }
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        })()
    }

    // --- Initialization logic using GM functions (only runs on non-input.html pages) ---
    try {
        console.log("QPI: Checking for temporary PFP data...");
        const tempPfp = await GM.getValue('current_pfp');

        if (tempPfp && tempPfp.receiver) {
            console.log("QPI: Found temporary data, saving to tab and deleting temp:", tempPfp);
            await GM.saveTab({ receiver: tempPfp.receiver });
            await GM.deleteValue('current_pfp');
            console.log("QPI: Saved receiver to tab and deleted temporary value.");
            await initializeQuickInput(tempPfp.receiver);
        } else {
            console.log("QPI: No temporary data found. Checking tab data...");
            const tabData = await GM.getTab();
            if (tabData && tabData.receiver) {
                console.log("QPI: Found receiver data in tab:", tabData.receiver);
                await initializeQuickInput(tabData.receiver);
            } else {
                console.log("QPI: No PFP receiver data found for this tab. Quick Input not activated.");
            }
        }
    } catch (error) {
        console.error("QPI: Error during initialization:", error);
    }

})();