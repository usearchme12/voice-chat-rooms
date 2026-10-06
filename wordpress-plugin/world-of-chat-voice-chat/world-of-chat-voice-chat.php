<?php
/**
 * Plugin Name: World of Chat - Voice Chat
 * Plugin URI: https://www.worldofchat.co.uk/voice-chat-room/
 * Description: Low-latency, push-to-talk anonymous voice chat rooms with dynamic mic warmup, waveform audio bubbles, and multi-theme support.
 * Version: 1.4.8
 * Author: World of Chat
 * Author URI: https://www.worldofchat.co.uk/
 * Text Domain: world-of-chat-voice-chat
 * License: GPLv2 or later
 */

if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly
}

define('WOC_VR_VERSION', '1.4.8');
define('WOC_VR_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('WOC_VR_PLUGIN_URL', plugin_dir_url(__FILE__));

// Require admin settings, shortcode handler, and persistent history storage
require_once WOC_VR_PLUGIN_DIR . 'includes/class-woc-admin.php';
require_once WOC_VR_PLUGIN_DIR . 'includes/class-woc-shortcode.php';
require_once WOC_VR_PLUGIN_DIR . 'includes/class-woc-history.php';

/**
 * Initialize Plugin
 */
class WOC_Voice_Rooms_Plugin {
    private static $instance = null;

    public static function get_instance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        // Register Activation Hook
        register_activation_hook(__FILE__, array($this, 'activate'));

        // Initialize Admin
        if (is_admin()) {
            WOC_Voice_Rooms_Admin::get_instance();
        }

        // Initialize Shortcode
        WOC_Voice_Rooms_Shortcode::get_instance();

        // Register Scripts and Styles
        add_action('wp_enqueue_scripts', array($this, 'register_assets'));

        // Plugin action links
        add_filter('plugin_action_links_' . plugin_basename(__FILE__), array($this, 'add_action_links'));

        // Set default server URL if empty
        $saved = get_option('woc_vr_server_url');
        if (empty($saved)) {
            update_option('woc_vr_server_url', 'https://voice-chat-rooms-fwf0.onrender.com');
        }
    }

    public function activate() {
        // Set default server URL if empty
        $saved = get_option('woc_vr_server_url');
        if (empty($saved)) {
            update_option('woc_vr_server_url', 'https://voice-chat-rooms-fwf0.onrender.com');
        }

        // Set default options if not existing
        $default_options = array(
            'server_url'       => 'https://voice-chat-rooms-fwf0.onrender.com',
            'default_theme'    => 'cyber-noir',
            'max_seconds'      => 30,
            'sound_effects'    => 1,
            'wp_user_callsign' => 1,
            'widget_height'    => '750px',
            'widget_max_width' => '600px',
        );

        foreach ($default_options as $key => $val) {
            if (get_option('woc_vr_' . $key) === false) {
                update_option('woc_vr_' . $key, $val);
            }
        }
    }

    public function register_assets() {
        // Main Plugin CSS (local)
        wp_register_style(
            'woc-vr-styles',
            WOC_VR_PLUGIN_URL . 'assets/css/voice-room.css',
            array(),
            WOC_VR_VERSION
        );

        // Bundled Local Socket.io Client
        wp_register_script(
            'woc-vr-socket-io',
            WOC_VR_PLUGIN_URL . 'assets/js/socket.io.min.js',
            array(),
            '4.7.2',
            true
        );

        // Main Frontend Voice App JS
        wp_register_script(
            'woc-vr-app',
            WOC_VR_PLUGIN_URL . 'assets/js/voice-room.js',
            array('woc-vr-socket-io'),
            WOC_VR_VERSION,
            true
        );
    }

    public function add_action_links($links) {
        $settings_link = '<a href="' . admin_url('options-general.php?page=woc-voice-chat') . '">' . __('Settings', 'world-of-chat-voice-chat') . '</a>';
        array_unshift($links, $settings_link);
        return $links;
    }
}

// Instantiate
WOC_Voice_Rooms_Plugin::get_instance();
