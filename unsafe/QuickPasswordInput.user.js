// ==UserScript==
// @name         Password From Phone Quick Input
// @version      1.0
// @author       SuperSafeMessage
// @match        *://*/*
// @run-at document-start
// ==/UserScript==

(function () {
    'use strict';

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
})();