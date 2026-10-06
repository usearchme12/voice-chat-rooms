/* ==========================================================================
   World of Chat - Voice Rooms (Admin Script)
   ========================================================================== */

(function($) {
    'use strict';

    $(document).ready(function() {
        // Copy Shortcode Button
        $('.woc-copy-btn').on('click', function(e) {
            e.preventDefault();
            const textToCopy = $(this).data('copy');
            const $btn = $(this);

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(textToCopy).then(function() {
                    const originalText = $btn.text();
                    $btn.text('Copied!');
                    setTimeout(function() {
                        $btn.text(originalText);
                    }, 2000);
                });
            } else {
                // Fallback
                const temp = $('<textarea>');
                $('body').append(temp);
                temp.val(textToCopy).select();
                document.execCommand('copy');
                temp.remove();
                $btn.text('Copied!');
                setTimeout(function() {
                    $btn.text('Copy');
                }, 2000);
            }
        });

        // Test Server Connection
        $('#woc-test-server-btn').on('click', function(e) {
            e.preventDefault();
            const serverUrl = $('#woc_vr_server_url').val().trim();
            const $badge = $('#woc-server-status-badge');
            const $btn = $(this);

            if (!serverUrl) {
                alert('Please enter a valid server URL first.');
                return;
            }

            $badge.attr('class', 'woc-badge woc-badge-warning').text('Testing connection (please wait)...');
            $btn.prop('disabled', true);

            const startTime = Date.now();
            let testSocket = null;
            let finished = false;

            const cleanup = function() {
                if (testSocket) {
                    testSocket.disconnect();
                    testSocket = null;
                }
                $btn.prop('disabled', false);
            };

            try {
                if (typeof io === 'undefined') {
                    $badge.attr('class', 'woc-badge woc-badge-error').text('Socket.io library not loaded');
                    cleanup();
                    return;
                }

                testSocket = io(serverUrl, {
                    timeout: 8000,
                    reconnection: false
                });

                testSocket.on('connect', function() {
                    if (finished) return;
                    finished = true;
                    const latency = Date.now() - startTime;
                    $badge.attr('class', 'woc-badge woc-badge-success')
                          .html(`Online &#10003; (Latency: ${latency}ms)`);
                    cleanup();
                });

                testSocket.on('connect_error', function(err) {
                    if (finished) return;
                    finished = true;
                    $badge.attr('class', 'woc-badge woc-badge-error')
                          .text('Could not connect (server sleeping or invalid URL)');
                    cleanup();
                });

                // Hard fallback timeout
                setTimeout(function() {
                    if (!finished) {
                        finished = true;
                        $badge.attr('class', 'woc-badge woc-badge-warning')
                              .text('Server response timeout (please verify URL & port)');
                        cleanup();
                    }
                }, 8500);

            } catch (err) {
                $badge.attr('class', 'woc-badge woc-badge-error').text('Connection error: ' + err.message);
                cleanup();
            }
        });
    });
})(jQuery);
