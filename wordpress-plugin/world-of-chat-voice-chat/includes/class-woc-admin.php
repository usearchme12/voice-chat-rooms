<?php
if (!defined('ABSPATH')) {
    exit;
}

class WOC_Voice_Rooms_Admin {
    private static $instance = null;

    public static function get_instance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        add_action('admin_menu', array($this, 'add_settings_page'));
        add_action('admin_init', array($this, 'register_settings'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_assets'));
    }

    public function add_settings_page() {
        add_options_page(
            __('Voice Rooms Settings', 'world-of-chat-voice-chat'),
            __('Voice Rooms', 'world-of-chat-voice-chat'),
            'manage_options',
            'world-of-chat-voice-chat',
            array($this, 'render_settings_page')
        );

        // Also alias woc-voice-rooms so both URL slugs work
        add_submenu_page(
            null,
            __('Voice Rooms Settings', 'world-of-chat-voice-chat'),
            __('Voice Rooms', 'world-of-chat-voice-chat'),
            'manage_options',
            'world-of-chat-voice-chat',
            array($this, 'render_settings_page')
        );
    }

    public function register_settings() {
        register_setting('woc_vr_settings_group', 'woc_vr_server_url', array(
            'type'              => 'string',
            'sanitize_callback' => 'esc_url_raw',
            'default'           => 'https://voice-chat-rooms-fwf0.onrender.com'
        ));

        register_setting('woc_vr_settings_group', 'woc_vr_default_theme', array(
            'type'              => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default'           => 'cyber-noir'
        ));

        register_setting('woc_vr_settings_group', 'woc_vr_max_seconds', array(
            'type'              => 'integer',
            'sanitize_callback' => 'absint',
            'default'           => 30
        ));

        register_setting('woc_vr_settings_group', 'woc_vr_sound_effects', array(
            'type'              => 'boolean',
            'sanitize_callback' => 'rest_sanitize_boolean',
            'default'           => 1
        ));

        register_setting('woc_vr_settings_group', 'woc_vr_wp_user_callsign', array(
            'type'              => 'boolean',
            'sanitize_callback' => 'rest_sanitize_boolean',
            'default'           => 1
        ));

        register_setting('woc_vr_settings_group', 'woc_vr_widget_height', array(
            'type'              => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default'           => '750px'
        ));

        register_setting('woc_vr_settings_group', 'woc_vr_widget_max_width', array(
            'type'              => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default'           => '600px'
        ));
    }

    public function enqueue_admin_assets($hook) {
        if ($hook !== 'settings_page_woc-voice-rooms' && $hook !== 'settings_page_woc-voice-chat') {
            return;
        }

        wp_enqueue_style(
            'woc-vr-admin-css',
            WOC_VR_PLUGIN_URL . 'assets/css/admin-style.css',
            array(),
            WOC_VR_VERSION
        );

        wp_enqueue_script(
            'woc-vr-socket-io',
            WOC_VR_PLUGIN_URL . 'assets/js/socket.io.min.js',
            array(),
            '4.7.2',
            true
        );

        wp_enqueue_script(
            'woc-vr-admin-js',
            WOC_VR_PLUGIN_URL . 'assets/js/admin.js',
            array('jquery', 'woc-vr-socket-io'),
            WOC_VR_VERSION,
            true
        );

        $saved_server = get_option('woc_vr_server_url');
        if (empty($saved_server)) {
            $saved_server = 'https://voice-chat-rooms-fwf0.onrender.com';
            update_option('woc_vr_server_url', $saved_server);
        }

        wp_localize_script('woc-vr-admin-js', 'wocAdminData', array(
            'serverUrl' => $saved_server,
        ));
    }

    public function render_settings_page() {
        $server_url = get_option('woc_vr_server_url');
        if (empty($server_url)) {
            $server_url = 'https://voice-chat-rooms-fwf0.onrender.com';
            update_option('woc_vr_server_url', $server_url);
        }
        $default_theme    = get_option('woc_vr_default_theme', 'cyber-noir');
        $max_seconds      = get_option('woc_vr_max_seconds', 30);
        $sound_effects    = get_option('woc_vr_sound_effects', 1);
        $wp_user_callsign = get_option('woc_vr_wp_user_callsign', 1);
        $widget_height    = get_option('woc_vr_widget_height', '750px');
        $widget_max_width = get_option('woc_vr_widget_max_width', '600px');
        ?>
        <div class="wrap woc-admin-wrapper">
            <div class="woc-admin-header">
                <h1><span class="dashicons dashicons-microphone"></span> World of Chat: Voice Rooms</h1>
                <p class="description">Configure your live push-to-talk voice room server, themes, and member experience.</p>
            </div>

            <?php if (isset($_GET['settings-updated']) && $_GET['settings-updated']) : ?>
                <div class="notice notice-success is-dismissible">
                    <p><strong>Settings saved successfully!</strong></p>
                </div>
            <?php endif; ?>

            <div class="woc-admin-grid">
                <!-- Main Settings Form -->
                <div class="woc-admin-main">
                    <form method="post" action="options.php" class="woc-card">
                        <?php settings_fields('woc_vr_settings_group'); ?>

                        <h2>Server Configuration</h2>
                        <table class="form-table">
                            <tr>
                                <th scope="row"><label for="woc_vr_server_url">Socket.io Server URL</label></th>
                                <td>
                                    <input name="woc_vr_server_url" type="url" id="woc_vr_server_url" value="<?php echo esc_attr($server_url); ?>" class="regular-text" required />
                                    <p class="description">Your hosted Node.js / Socket.io audio relay server (e.g. Render, Railway, VPS, or localhost).</p>
                                    
                                    <div class="woc-server-test-box">
                                        <button type="button" id="woc-test-server-btn" class="button button-secondary">
                                            <span class="dashicons dashicons-update"></span> Test Server Connection
                                        </button>
                                        <span id="woc-server-status-badge" class="woc-badge woc-badge-idle">Status: Ready to test</span>
                                    </div>
                                </td>
                            </tr>
                        </table>

                        <hr class="woc-divider">

                        <h2>Appearance & Behavior</h2>
                        <table class="form-table">
                            <tr>
                                <th scope="row"><label for="woc_vr_default_theme">Default Theme</label></th>
                                <td>
                                    <select name="woc_vr_default_theme" id="woc_vr_default_theme">
                                        <option value="cyber-noir" <?php selected($default_theme, 'cyber-noir'); ?>>Cyber-Noir (Glowing Cyan / Magenta / Orbitron)</option>
                                        <option value="clean-dark" <?php selected($default_theme, 'clean-dark'); ?>>Clean Dark (Slate Gray / Indigo)</option>
                                        <option value="clean-light" <?php selected($default_theme, 'clean-light'); ?>>Clean Light (White / Blue / Day Mode)</option>
                                    </select>
                                    <p class="description">Can also be overridden per shortcode using <code>[woc_voice_room theme="clean-dark"]</code>.</p>
                                </td>
                            </tr>

                            <tr>
                                <th scope="row"><label for="woc_vr_max_seconds">Max Transmission Limit</label></th>
                                <td>
                                    <input name="woc_vr_max_seconds" type="number" min="5" max="180" id="woc_vr_max_seconds" value="<?php echo esc_attr($max_seconds); ?>" class="small-text" /> seconds
                                    <p class="description">Prevents users from accidentally holding their mic open indefinitely. Transmissions automatically finish when this limit is reached.</p>
                                </td>
                            </tr>

                            <tr>
                                <th scope="row">Radio Beep SFX</th>
                                <td>
                                    <label>
                                        <input name="woc_vr_sound_effects" type="checkbox" value="1" <?php checked(1, $sound_effects); ?> />
                                        Play walkie-talkie start/stop chirp sounds
                                    </label>
                                    <p class="description">Uses native Web Audio synthesis for tactical transceiver sound effects.</p>
                                </td>
                            </tr>

                            <tr>
                                <th scope="row">WordPress User Integration</th>
                                <td>
                                    <label>
                                        <input name="woc_vr_wp_user_callsign" type="checkbox" value="1" <?php checked(1, $wp_user_callsign); ?> />
                                        Auto-fill callsign for logged-in WordPress users
                                    </label>
                                    <p class="description">If a user is logged into your site, their display name will be pre-filled so they can jump straight in.</p>
                                </td>
                            </tr>

                            <tr>
                                <th scope="row"><label for="woc_vr_widget_height">Widget Height</label></th>
                                <td>
                                    <input name="woc_vr_widget_height" type="text" id="woc_vr_widget_height" value="<?php echo esc_attr($widget_height); ?>" class="regular-text" style="max-width: 150px;" />
                                    <p class="description">CSS height of the widget (e.g. <code>750px</code>, <code>680px</code>, or <code>85vh</code>).</p>
                                </td>
                            </tr>

                            <tr>
                                <th scope="row"><label for="woc_vr_widget_max_width">Widget Max Width</label></th>
                                <td>
                                    <input name="woc_vr_widget_max_width" type="text" id="woc_vr_widget_max_width" value="<?php echo esc_attr($widget_max_width); ?>" class="regular-text" style="max-width: 150px;" />
                                    <p class="description">CSS max-width of the widget (e.g. <code>600px</code> or <code>100%</code>).</p>
                                </td>
                            </tr>
                        </table>

                        <?php submit_button('Save Voice Room Settings'); ?>
                    </form>
                </div>

                <!-- Sidebar / Help & Shortcode Guide -->
                <div class="woc-admin-sidebar">
                    <div class="woc-card">
                        <h3><span class="dashicons dashicons-shortcode"></span> Shortcode Guide</h3>
                        <p>Place this shortcode on any WordPress Page, Post, or Elementor / Gutenberg block:</p>

                        <div class="woc-code-snippet">
                            <code>[woc_voice_room]</code>
                            <button type="button" class="button button-small woc-copy-btn" data-copy="[woc_voice_room]">Copy</button>
                        </div>

                        <h4>Available Shortcode Attributes:</h4>
                        <ul class="woc-attributes-list">
                            <li>
                                <strong>theme:</strong> <code>cyber-noir</code>, <code>clean-dark</code>, or <code>clean-light</code><br>
                                <em>Example:</em> <code>[woc_voice_room theme="clean-dark"]</code>
                            </li>
                            <li>
                                <strong>height:</strong> e.g. <code>700px</code> or <code>800px</code><br>
                                <em>Example:</em> <code>[woc_voice_room height="800px"]</code>
                            </li>
                            <li>
                                <strong>max_seconds:</strong> Transmission timeout in seconds<br>
                                <em>Example:</em> <code>[woc_voice_room max_seconds="45"]</code>
                            </li>
                            <li>
                                <strong>sound_effects:</strong> <code>1</code> (on) or <code>0</code> (off)<br>
                                <em>Example:</em> <code>[woc_voice_room sound_effects="0"]</code>
                            </li>
                        </ul>
                    </div>

                    <div class="woc-card">
                        <h3><span class="dashicons dashicons-cloud"></span> Render Server Tip</h3>
                        <p>If using a free Render instance, the server enters sleep mode after 15 minutes of inactivity. When a visitor opens the voice room, the widget automatically shows a <strong>"Waking up cloud server..."</strong> banner while it spins up (~20–30s) and connects seamlessly.</p>
                    </div>
                </div>
            </div>
        </div>
        <?php
    }
}
