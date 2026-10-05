<?php
/**
 * Plugin Name: World of Chat - Voice Rooms
 * Plugin URI: https://www.worldofchat.co.uk/
 * Description: Low-latency, push-to-talk anonymous voice chat rooms with dynamic mic warmup, waveform audio bubbles, and multi-theme support.
 * Version: 1.4.8
 * Author: World of Chat
 * Author URI: https://www.worldofchat.co.uk/
 * Text Domain: woc-voice-rooms
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

        // Auto-migrate legacy Render URL to voice.worldofchat.co.uk if stored in DB
        $saved = get_option('woc_vr_server_url');
        if (empty($saved) || strpos($saved, 'onrender.com') !== false) {
            update_option('woc_vr_server_url', 'https://voice.worldofchat.co.uk');
        }
    }

    public function activate() {
        // Auto-migrate legacy Render URL to voice.worldofchat.co.uk
        $saved = get_option('woc_vr_server_url');
        if (empty($saved) || strpos($saved, 'onrender.com') !== false) {
            update_option('woc_vr_server_url', 'https://voice.worldofchat.co.uk');
        }

        // Set default options if not existing
        $default_options = array(
            'server_url'       => 'https://voice.worldofchat.co.uk',
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
        // Google Fonts for Orbitron & Inter
        wp_register_style(
            'woc-vr-google-fonts',
            'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&family=Inter:wght@300;400;500;600;700&display=swap',
            array(),
            null
        );

        // Main Plugin CSS
        wp_register_style(
            'woc-vr-styles',
            WOC_VR_PLUGIN_URL . 'assets/css/voice-room.css',
            array('woc-vr-google-fonts'),
            WOC_VR_VERSION
        );

        // Socket.io CDN
        wp_register_script(
            'socket-io-client',
            'https://cdn.socket.io/4.7.2/socket.io.min.js',
            array(),
            '4.7.2',
            true
        );

        // Main Frontend Voice App JS
        wp_register_script(
            'woc-vr-app',
            WOC_VR_PLUGIN_URL . 'assets/js/voice-room.js',
            array('socket-io-client'),
            WOC_VR_VERSION,
            true
        );
    }

    public function add_action_links($links) {
        $settings_link = '<a href="' . admin_url('options-general.php?page=woc-voice-chat') . '">' . __('Settings', 'woc-voice-chat') . '</a>';
        array_unshift($links, $settings_link);
        return $links;
    }
}

// Instantiate
WOC_Voice_Rooms_Plugin::get_instance();
