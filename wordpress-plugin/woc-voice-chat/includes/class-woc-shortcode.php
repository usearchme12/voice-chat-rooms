<?php
if (!defined('ABSPATH')) {
    exit;
}

class WOC_Voice_Rooms_Shortcode {
    private static $instance = null;
    private static $instance_count = 0;

    public static function get_instance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        add_shortcode('woc_voice_room', array($this, 'render_shortcode'));
        add_shortcode('voice_room', array($this, 'render_shortcode')); // Convenient alias
    }

    public function render_shortcode($atts = array()) {
        self::$instance_count++;
        $unique_id = 'woc-voice-widget-' . self::$instance_count;

        // Fetch saved options from WP
        $opt_server_url = get_option('woc_vr_server_url');
        if (empty($opt_server_url) || strpos($opt_server_url, 'onrender.com') !== false) {
            $opt_server_url = 'https://voice.worldofchat.co.uk';
            update_option('woc_vr_server_url', $opt_server_url);
        }
        $opt_theme            = get_option('woc_vr_default_theme', 'cyber-noir');
        $opt_max_seconds      = (int) get_option('woc_vr_max_seconds', 30);
        $opt_sound_effects    = (bool) get_option('woc_vr_sound_effects', 1);
        $opt_wp_user_callsign = (bool) get_option('woc_vr_wp_user_callsign', 1);
        $opt_height           = get_option('woc_vr_widget_height', '750px');
        $opt_max_width        = get_option('woc_vr_widget_max_width', '600px');

        // Parse user shortcode attributes
        $atts = shortcode_atts(array(
            'theme'         => $opt_theme,
            'server_url'    => $opt_server_url,
            'max_seconds'   => $opt_max_seconds,
            'sound_effects' => $opt_sound_effects ? '1' : '0',
            'height'        => $opt_height,
            'max_width'     => $opt_max_width,
            'title'         => 'VOICE ROOM',
            'subtitle'      => 'Enter the frequency. Low-latency, push-to-talk audio.'
        ), $atts, 'woc_voice_room');

        // Enqueue Assets
        wp_enqueue_style('woc-vr-google-fonts');
        wp_enqueue_style('woc-vr-styles');
        wp_enqueue_script('socket-io-client');
        wp_enqueue_script('woc-vr-app');

        // Check if user is logged into WordPress
        $user_logged_in = is_user_logged_in();
        $user_display_name = '';
        if ($user_logged_in && $opt_wp_user_callsign) {
            $current_user = wp_get_current_user();
            $user_display_name = $current_user->display_name ?: $current_user->user_login;
        }

        // Localize script data for this widget
        $config_data = array(
            'serverUrl'    => esc_url_raw($atts['server_url']),
            'theme'        => sanitize_html_class($atts['theme']),
            'maxSeconds'   => max(5, intval($atts['max_seconds'])),
            'soundEffects' => ($atts['sound_effects'] === '1' || $atts['sound_effects'] === 'true' || $atts['sound_effects'] === 1),
            'currentUser'  => array(
                'isLoggedIn'  => $user_logged_in,
                'displayName' => esc_html($user_display_name),
            ),
            'ajaxUrl'        => admin_url('admin-ajax.php'),
            'nonce'          => wp_create_nonce('woc_vr_voice_nonce'),
            'initialHistory' => class_exists('WOC_Voice_History') ? WOC_Voice_History::get_instance()->get_recent_notes() : array(),
            'i18n'         => array(
                'connecting'       => __('SCANNING FREQUENCY...', 'woc-voice-rooms'),
                'wakingServer'     => __('WAKING UP SERVER (~20s)...', 'woc-voice-rooms'),
                'connected'        => __('FREQUENCY ONLINE', 'woc-voice-rooms'),
                'offline'          => __('DISCONNECTED (CLICK TO RETRY)', 'woc-voice-rooms'),
                'transmitting'     => __('TRANSMITTING...', 'woc-voice-rooms'),
                'micConnecting'    => __('CONNECTING MIC...', 'woc-voice-rooms'),
                'micError'         => __('Could not access microphone.', 'woc-voice-rooms'),
            )
        );

        wp_localize_script('woc-vr-app', 'wocVoiceConfig_' . self::$instance_count, $config_data);

        // Sanitize theme and sizing
        $theme_class = 'theme-' . sanitize_html_class($atts['theme']);
        $container_style = sprintf(
            'height: %s; max-width: %s;',
            esc_attr($atts['height']),
            esc_attr($atts['max_width'])
        );

        ob_start();
        ?>
        <div id="<?php echo esc_attr($unique_id); ?>" 
             class="woc-voice-widget <?php echo esc_attr($theme_class); ?>" 
             style="<?php echo esc_attr($container_style); ?>"
             data-instance-id="<?php echo esc_attr(self::$instance_count); ?>">
             
            <!-- Initial Join Frequency Overlay -->
            <div class="woc-join-overlay">
                <div class="woc-overlay-card">
                    <div class="woc-badge-pill">● PUSH-TO-TALK FREQUENCY</div>
                    <h2 class="woc-glitch-title" data-text="<?php echo esc_attr($atts['title']); ?>">
                        <?php echo esc_html($atts['title']); ?>
                    </h2>
                    <p class="woc-overlay-desc"><?php echo esc_html($atts['subtitle']); ?></p>

                    <div class="woc-callsign-group">
                        <label for="<?php echo esc_attr($unique_id); ?>-callsign" class="screen-reader-text">
                            <?php esc_html_e('Your Callsign', 'woc-voice-rooms'); ?>
                        </label>
                        <input type="text" 
                               id="<?php echo esc_attr($unique_id); ?>-callsign" 
                               class="woc-callsign-input" 
                               value="<?php echo esc_attr($user_display_name); ?>" 
                               placeholder="<?php esc_attr_e('ENTER CALLSIGN (E.G. VIPER)', 'woc-voice-rooms'); ?>" 
                               maxlength="16" 
                               autocomplete="off" />
                        <?php if ($user_logged_in && !empty($user_display_name)): ?>
                            <span class="woc-wp-badge">
                                <span class="dashicons dashicons-admin-users"></span> 
                                <?php printf(esc_html__('Logged in as %s', 'woc-voice-rooms'), esc_html($user_display_name)); ?>
                            </span>
                        <?php endif; ?>
                    </div>

                    <button type="button" class="woc-enter-btn" onclick="if(window.wocHandleEnterRoom){window.wocHandleEnterRoom(this);}else{var w=this.closest('.woc-voice-widget');if(w){w.setAttribute('data-woc-entered','1');var o=w.querySelector('.woc-join-overlay');var b=w.querySelector('.woc-app-body');if(o)o.classList.add('woc-hidden');if(b)b.classList.remove('woc-hidden');}}" ontouchend="if(window.wocHandleEnterRoom){window.wocHandleEnterRoom(this);}else{var w=this.closest('.woc-voice-widget');if(w){w.setAttribute('data-woc-entered','1');var o=w.querySelector('.woc-join-overlay');var b=w.querySelector('.woc-app-body');if(o)o.classList.add('woc-hidden');if(b)b.classList.remove('woc-hidden');}}">
                        <span><?php esc_html_e('ENTER ROOM', 'woc-voice-rooms'); ?></span>
                    </button>
                </div>
            </div>

            <!-- Main App Body -->
            <div class="woc-app-body woc-hidden">
                <!-- Top Status Header -->
                <header class="woc-widget-header">
                    <div class="woc-logo">
                        <span class="woc-logo-main">VOICE</span><span class="woc-logo-accent">ROOM</span>
                    </div>
                    <div class="woc-status-indicator">
                        <span class="woc-status-dot woc-status-connecting"></span>
                        <span class="woc-status-text"><?php esc_html_e('SCANNING FREQUENCY...', 'woc-voice-rooms'); ?></span>
                        <span class="woc-user-count woc-hidden">0 ONLINE</span>
                        <span class="woc-speakers-count woc-hidden">0 SPEAKERS</span>
                    </div>
                </header>

                <!-- Live Cloud Server Waking Up Banner -->
                <div class="woc-server-waking-banner woc-hidden">
                    <span class="woc-pulse-icon">⚡</span>
                    <span class="woc-banner-msg"><?php esc_html_e('Cloud server is waking up. Please stand by...', 'woc-voice-rooms'); ?></span>
                </div>

                <!-- Active Transmission HUD -->
                <div class="woc-transmission-hud woc-hidden">
                    <span class="woc-hud-pulse">●</span>
                    <span class="woc-hud-text">CALLSIGN IS TRANSMITTING...</span>
                </div>

                <!-- Chat Stream Messages (Voice Bubbles) -->
                <div class="woc-chat-stream" role="log" aria-live="polite">
                    <div class="woc-stream-empty">
                        <div class="woc-empty-radar"></div>
                        <p><?php esc_html_e('Room frequency open. Tap mic below to transmit.', 'woc-voice-rooms'); ?></p>
                    </div>
                </div>

                <!-- Canvas Visualizer Background Overlay -->
                <div class="woc-visualizer-wrap">
                    <canvas class="woc-visualizer-canvas"></canvas>
                </div>

                <!-- Bottom Push-To-Talk Control Bar -->
                <footer class="woc-widget-controls">
                    <div class="woc-controls-row">
                        <!-- Trash / Discard Button (Visible when recording) -->
                        <button type="button" class="woc-discard-btn woc-hidden" title="<?php esc_attr_e('Discard transmission', 'woc-voice-rooms'); ?>" aria-label="<?php esc_attr_e('Discard recording', 'woc-voice-rooms'); ?>">
                            <svg viewBox="0 0 24 24" width="22" height="22">
                                <path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                            </svg>
                        </button>

                        <div class="woc-mic-wrapper">
                            <!-- SVG Circular Progress Countdown Ring -->
                            <svg class="woc-timer-ring" width="86" height="86" viewBox="0 0 86 86">
                                <circle class="woc-timer-ring-bg" cx="43" cy="43" r="38"></circle>
                                <circle class="woc-timer-ring-progress" cx="43" cy="43" r="38"></circle>
                            </svg>

                            <!-- PTT Mic Button -->
                            <button type="button" class="woc-mic-btn" aria-label="<?php esc_attr_e('Record Voice Transmission', 'woc-voice-rooms'); ?>">
                                <svg viewBox="0 0 24 24" width="30" height="30">
                                    <path fill="currentColor" d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                                    <path fill="currentColor" d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                    
                    <div class="woc-mic-caption">
                        <span class="woc-mic-status-label"><?php esc_html_e('TAP MIC TO TRANSMIT', 'woc-voice-rooms'); ?></span>
                        <span class="woc-mic-timer-label woc-hidden">00:30</span>
                    </div>
                </footer>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }
}
