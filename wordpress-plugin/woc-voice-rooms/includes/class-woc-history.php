<?php
if (!defined('ABSPATH')) {
    exit;
}

class WOC_Voice_History {
    private static $instance = null;
    const MAX_HISTORY = 25;
    const OPTION_KEY = 'woc_vr_recent_history';

    public static function get_instance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        add_action('wp_ajax_woc_save_voice_note', array($this, 'ajax_save_note'));
        add_action('wp_ajax_nopriv_woc_save_voice_note', array($this, 'ajax_save_note'));

        add_action('wp_ajax_woc_delete_voice_note', array($this, 'ajax_delete_note'));
        add_action('wp_ajax_nopriv_woc_delete_voice_note', array($this, 'ajax_delete_note'));

        add_action('wp_ajax_woc_get_voice_notes', array($this, 'ajax_get_notes'));
        add_action('wp_ajax_nopriv_woc_get_voice_notes', array($this, 'ajax_get_notes'));
    }

    private function get_upload_dir() {
        $upload = wp_upload_dir();
        $dir = $upload['basedir'] . '/woc-voice';
        if (!file_exists($dir)) {
            wp_mkdir_p($dir);
            // Write index.html to protect directory listing
            @file_put_contents($dir . '/index.html', '');
        }
        return array(
            'dir' => $dir,
            'url' => $upload['baseurl'] . '/woc-voice'
        );
    }

    public function get_recent_notes() {
        $paths = $this->get_upload_dir();
        $history = get_option(self::OPTION_KEY, array());
        if (!is_array($history)) {
            $history = array();
        }

        // Clean up: Only keep entries whose audio files actually exist on disk
        $valid = array();
        $needs_update = false;
        foreach ($history as $item) {
            if (!empty($item['msgId'])) {
                $ext = (strpos($item['mimeType'] ?? '', 'mp4') !== false) ? 'mp4' : 'webm';
                $file = $paths['dir'] . '/' . $item['msgId'] . '.' . $ext;
                if (file_exists($file)) {
                    if (empty($item['timestamp'])) {
                        $item['timestamp'] = filemtime($file);
                        $needs_update = true;
                    }
                    $valid[] = $item;
                } else {
                    $needs_update = true;
                }
            }
        }

        if ($needs_update) {
            update_option(self::OPTION_KEY, $valid, false);
            $history = $valid;
        }

        return array_values($history);
    }

    public function ajax_get_notes() {
        check_ajax_referer('woc_vr_voice_nonce', 'nonce', false);
        wp_send_json_success($this->get_recent_notes());
    }

    public function ajax_save_note() {
        check_ajax_referer('woc_vr_voice_nonce', 'nonce');

        if (empty($_FILES['audio']) || empty($_POST['msg_id'])) {
            wp_send_json_error('Missing audio or msg_id');
        }

        $file = $_FILES['audio'];
        if ($file['error'] !== UPLOAD_ERR_OK) {
            wp_send_json_error('Upload error: ' . $file['error']);
        }

        // Limit file size to 10MB
        if ($file['size'] > 10 * 1024 * 1024) {
            wp_send_json_error('File too large');
        }

        $msg_id = preg_replace('/[^a-zA-Z0-9_\-]/', '', sanitize_text_field($_POST['msg_id']));
        $user_id = sanitize_text_field($_POST['user_id'] ?? 'ANONYMOUS');
        $mime_type = sanitize_mime_type($_POST['mime_type'] ?? 'audio/webm');

        $ext = 'webm';
        if (strpos($mime_type, 'mp4') !== false) {
            $ext = 'mp4';
        } elseif (strpos($mime_type, 'ogg') !== false) {
            $ext = 'ogg';
        }

        $paths = $this->get_upload_dir();
        $filename = $msg_id . '.' . $ext;
        $dest = $paths['dir'] . '/' . $filename;
        $url  = $paths['url'] . '/' . $filename;

        if (!move_uploaded_file($file['tmp_name'], $dest)) {
            wp_send_json_error('Failed to move uploaded file');
        }

        $item = array(
            'msgId'     => $msg_id,
            'userId'    => $user_id,
            'url'       => $url,
            'mimeType'  => $mime_type,
            'timestamp' => time()
        );

        $history = $this->get_recent_notes();
        $history[] = $item;

        // Strict 25-File Hard Cap: Older files are permanently deleted from disk immediately
        while (count($history) > self::MAX_HISTORY) {
            $old = array_shift($history);
            if (!empty($old['msgId'])) {
                $matches = glob($paths['dir'] . '/' . $old['msgId'] . '.*');
                if ($matches) {
                    foreach ($matches as $f) {
                        @unlink($f);
                    }
                }
            }
        }

        // 7-Day Expiry: Auto-delete voice notes older than 7 days (instead of 24h) so rooms don't go blank
        $all_files = glob($paths['dir'] . '/*.{webm,mp4,ogg,wav}', GLOB_BRACE);
        if ($all_files) {
            $cutoff = time() - (7 * 86400);
            foreach ($all_files as $f) {
                if (@filemtime($f) < $cutoff) {
                    @unlink($f);
                }
            }
        }

        update_option(self::OPTION_KEY, $history, false);
        wp_send_json_success($item);
    }

    public function ajax_delete_note() {
        check_ajax_referer('woc_vr_voice_nonce', 'nonce');

        $msg_id = preg_replace('/[^a-zA-Z0-9_\-]/', '', sanitize_text_field($_POST['msg_id'] ?? ''));
        if (!$msg_id) {
            wp_send_json_error('Missing msg_id');
        }

        $paths = $this->get_upload_dir();
        $matches = glob($paths['dir'] . '/' . $msg_id . '.*');
        if ($matches) {
            foreach ($matches as $f) {
                @unlink($f);
            }
        }

        $history = $this->get_recent_notes();
        $new_history = array_values(array_filter($history, function($item) use ($msg_id) {
            return ($item['msgId'] ?? '') !== $msg_id;
        }));

        update_option(self::OPTION_KEY, $new_history, false);
        wp_send_json_success(array('deleted' => $msg_id));
    }
}

WOC_Voice_History::get_instance();
