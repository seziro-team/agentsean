<?php
/**
 * Plugin Name: Agent Sean Bridge
 * Plugin URI: https://github.com/seziro-team/agentsean
 * Description: Registers SEO meta for REST, normalized write endpoints, redirects, robots.txt, JSON-LD, media alt, and revision restore for Agent Sean.
 * Version: 0.1.0
 * Requires at least: 6.4
 * Requires PHP: 8.1
 * Author: Agent Sean
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: sean-bridge
 *
 * The daemon is AGPL-3.0-only. This plugin is GPL-2.0-or-later so it can
 * live in the WordPress.org directory (same split as Fleet Agent Site Manager).
 */

if (!defined('ABSPATH')) {
    exit;
}

define('SEAN_BRIDGE_VERSION', '0.1.0');
define('SEAN_BRIDGE_NS', 'sean/v1');

register_activation_hook(__FILE__, 'sean_bridge_install');

function sean_bridge_install(): void
{
    global $wpdb;
    $table = $wpdb->prefix . 'sean_changes';
    $charset = $wpdb->get_charset_collate();
    $sql = "CREATE TABLE {$table} (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        change_id varchar(64) NOT NULL,
        post_id bigint(20) unsigned NOT NULL,
        field_name varchar(64) NOT NULL,
        old_value longtext NULL,
        new_value longtext NULL,
        created_at datetime NOT NULL,
        PRIMARY KEY  (id),
        UNIQUE KEY change_id (change_id)
    ) {$charset};";
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    dbDelta($sql);
}

add_action('init', 'sean_bridge_register_meta');
add_action('rest_api_init', 'sean_bridge_routes');
add_action('wp_head', 'sean_bridge_jsonld', 99);
add_filter('robots_txt', 'sean_bridge_robots_txt', 10, 2);

function sean_bridge_register_meta(): void
{
    $types = get_post_types(['public' => true], 'names');
    $keys = [
        '_yoast_wpseo_title',
        '_yoast_wpseo_metadesc',
        '_yoast_wpseo_focuskw',
        '_yoast_wpseo_canonical',
        'rank_math_title',
        'rank_math_description',
        '_seopress_titles_title',
        '_seopress_titles_desc',
        '_sean_jsonld',
        '_sean_seo_title',
        '_sean_seo_description',
    ];
    foreach ($types as $type) {
        foreach ($keys as $key) {
            register_post_meta($type, $key, [
                'show_in_rest' => true,
                'single' => true,
                'type' => 'string',
                'auth_callback' => static function () {
                    return current_user_can('edit_posts');
                },
            ]);
        }
    }
}

function sean_bridge_routes(): void
{
    register_rest_route(SEAN_BRIDGE_NS, '/capabilities', [
        'methods' => 'GET',
        'permission_callback' => 'sean_bridge_can_edit',
        'callback' => 'sean_bridge_capabilities',
    ]);
    register_rest_route(SEAN_BRIDGE_NS, '/seo', [
        [
            'methods' => 'GET',
            'permission_callback' => 'sean_bridge_can_edit',
            'callback' => 'sean_bridge_get_seo',
        ],
        [
            'methods' => 'POST',
            'permission_callback' => 'sean_bridge_can_edit',
            'callback' => 'sean_bridge_post_seo',
        ],
    ]);
    register_rest_route(SEAN_BRIDGE_NS, '/rollback/(?P<id>[a-zA-Z0-9_-]+)', [
        'methods' => 'POST',
        'permission_callback' => 'sean_bridge_can_edit',
        'callback' => 'sean_bridge_rollback',
    ]);
    register_rest_route(SEAN_BRIDGE_NS, '/redirects', [
        'methods' => 'POST',
        'permission_callback' => 'sean_bridge_can_edit',
        'callback' => 'sean_bridge_redirects',
    ]);
    register_rest_route(SEAN_BRIDGE_NS, '/robots', [
        'methods' => 'POST',
        'permission_callback' => static function () {
            return current_user_can('manage_options');
        },
        'callback' => 'sean_bridge_robots',
    ]);
    register_rest_route(SEAN_BRIDGE_NS, '/schema', [
        'methods' => 'POST',
        'permission_callback' => 'sean_bridge_can_edit',
        'callback' => 'sean_bridge_schema',
    ]);
    register_rest_route(SEAN_BRIDGE_NS, '/media/(?P<id>\d+)/alt', [
        'methods' => 'POST',
        'permission_callback' => 'sean_bridge_can_edit',
        'callback' => 'sean_bridge_media_alt',
    ]);
    register_rest_route(SEAN_BRIDGE_NS, '/restore/(?P<id>\d+)', [
        'methods' => 'POST',
        'permission_callback' => 'sean_bridge_can_edit',
        'callback' => 'sean_bridge_restore_revision',
    ]);
}

function sean_bridge_can_edit(): bool
{
    return current_user_can('edit_posts');
}

function sean_bridge_capabilities(): WP_REST_Response
{
    $seo = 'none';
    $ver = null;
    if (defined('WPSEO_VERSION')) {
        $seo = 'yoast';
        $ver = WPSEO_VERSION;
    } elseif (defined('RANK_MATH_VERSION') || class_exists('RankMath')) {
        $seo = 'rankmath';
        $ver = defined('RANK_MATH_VERSION') ? RANK_MATH_VERSION : null;
    } elseif (defined('AIOSEO_VERSION')) {
        $seo = 'aioseo';
        $ver = AIOSEO_VERSION;
    } elseif (defined('SEOPRESS_VERSION')) {
        $seo = 'seopress';
        $ver = SEOPRESS_VERSION;
    }
    return new WP_REST_Response([
        'wpVersion' => get_bloginfo('version'),
        'phpVersion' => PHP_VERSION,
        'plugin' => 'sean-bridge',
        'pluginVersion' => SEAN_BRIDGE_VERSION,
        'seoPlugin' => $seo,
        'seoPluginVersion' => $ver,
        'permalinkStructure' => get_option('permalink_structure'),
        'publicPostTypes' => array_values(get_post_types(['public' => true])),
        'robotsPhysical' => file_exists(ABSPATH . 'robots.txt'),
    ]);
}

function sean_bridge_find_post(string $url): ?WP_Post
{
    $id = url_to_postid($url);
    if ($id) {
        $post = get_post($id);
        return $post instanceof WP_Post ? $post : null;
    }
    $path = wp_parse_url($url, PHP_URL_PATH);
    $slug = trim((string) $path, '/');
    if ($slug === '') {
        $front = (int) get_option('page_on_front');
        return $front ? get_post($front) : null;
    }
    $parts = explode('/', $slug);
    $last = end($parts);
    $found = get_page_by_path($slug) ?: get_page_by_path($last, OBJECT, get_post_types(['public' => true]));
    return $found instanceof WP_Post ? $found : null;
}

function sean_bridge_seo_title(WP_Post $post): string
{
    $keys = ['_sean_seo_title', '_yoast_wpseo_title', 'rank_math_title', '_seopress_titles_title'];
    foreach ($keys as $key) {
        $v = get_post_meta($post->ID, $key, true);
        if (is_string($v) && $v !== '') {
            return $v;
        }
    }
    return get_the_title($post);
}

function sean_bridge_get_seo(WP_REST_Request $req): WP_REST_Response|WP_Error
{
    $url = (string) $req->get_param('url');
    $post = sean_bridge_find_post($url);
    if (!$post) {
        return new WP_Error('not_found', 'No post for URL', ['status' => 404]);
    }
    $title = sean_bridge_seo_title($post);
    return new WP_REST_Response([
        'postId' => $post->ID,
        'url' => $url,
        'title' => $title,
        'html' => '<html><head><title>' . esc_html($title) . '</title></head></html>',
    ]);
}

function sean_bridge_post_seo(WP_REST_Request $req): WP_REST_Response|WP_Error
{
    $body = $req->get_json_params();
    if (!is_array($body)) {
        return new WP_Error('bad_request', 'JSON body required', ['status' => 400]);
    }
    if (!empty($body['dry_run']) || $req->get_param('dry_run')) {
        return new WP_REST_Response(['dryRun' => true, 'body' => $body]);
    }
    $url = (string) ($body['url'] ?? '');
    $post = sean_bridge_find_post($url);
    if (!$post) {
        return new WP_Error('not_found', 'No post for URL', ['status' => 404]);
    }
    $old = sean_bridge_seo_title($post);
    $title = isset($body['title']) ? sanitize_text_field((string) $body['title']) : $old;
    $change_id = sanitize_text_field((string) ($body['changeId'] ?? wp_generate_uuid4()));
    update_post_meta($post->ID, '_sean_seo_title', $title);
    if (defined('WPSEO_VERSION')) {
        update_post_meta($post->ID, '_yoast_wpseo_title', $title);
    }
    if (defined('RANK_MATH_VERSION') || class_exists('RankMath')) {
        update_post_meta($post->ID, 'rank_math_title', $title);
    }
    if (defined('SEOPRESS_VERSION')) {
        update_post_meta($post->ID, '_seopress_titles_title', $title);
    }
    if (defined('AIOSEO_VERSION') && function_exists('aioseo')) {
        // AIOSEO stores in its own table; core title is still our fallback.
        update_post_meta($post->ID, '_aioseo_title', $title);
    }
    sean_bridge_log_change($change_id, $post->ID, 'title', $old, $title);
    return new WP_REST_Response([
        'ok' => true,
        'postId' => $post->ID,
        'changeId' => $change_id,
        'before' => $old,
        'after' => $title,
    ]);
}

function sean_bridge_log_change(string $change_id, int $post_id, string $field, string $old, string $new): void
{
    global $wpdb;
    $wpdb->replace(
        $wpdb->prefix . 'sean_changes',
        [
            'change_id' => $change_id,
            'post_id' => $post_id,
            'field_name' => $field,
            'old_value' => $old,
            'new_value' => $new,
            'created_at' => current_time('mysql'),
        ]
    );
}

function sean_bridge_rollback(WP_REST_Request $req): WP_REST_Response|WP_Error
{
    global $wpdb;
    $id = (string) $req['id'];
    $row = $wpdb->get_row($wpdb->prepare(
        "SELECT * FROM {$wpdb->prefix}sean_changes WHERE change_id = %s",
        $id
    ), ARRAY_A);
    if (!$row) {
        return new WP_Error('not_found', 'Unknown change', ['status' => 404]);
    }
    update_post_meta((int) $row['post_id'], '_sean_seo_title', $row['old_value']);
    if (defined('WPSEO_VERSION')) {
        update_post_meta((int) $row['post_id'], '_yoast_wpseo_title', $row['old_value']);
    }
    return new WP_REST_Response(['ok' => true, 'restored' => $row['old_value']]);
}

function sean_bridge_redirects(WP_REST_Request $req): WP_REST_Response
{
    $body = $req->get_json_params();
    update_option('sean_bridge_redirects', is_array($body) ? $body : []);
    return new WP_REST_Response(['ok' => true]);
}

function sean_bridge_robots(WP_REST_Request $req): WP_REST_Response
{
    $body = $req->get_json_params();
    $txt = is_array($body) && isset($body['body']) ? (string) $body['body'] : '';
    update_option('sean_bridge_robots', $txt);
    return new WP_REST_Response(['ok' => true]);
}

function sean_bridge_robots_txt(string $output, bool $public): string
{
    $extra = get_option('sean_bridge_robots', '');
    if (is_string($extra) && $extra !== '') {
        return $output . "\n" . $extra;
    }
    return $output;
}

function sean_bridge_schema(WP_REST_Request $req): WP_REST_Response|WP_Error
{
    $body = $req->get_json_params();
    $url = is_array($body) ? (string) ($body['url'] ?? '') : '';
    $post = sean_bridge_find_post($url);
    if (!$post) {
        return new WP_Error('not_found', 'No post for URL', ['status' => 404]);
    }
    $json = is_array($body) ? wp_json_encode($body['json'] ?? []) : '[]';
    update_post_meta($post->ID, '_sean_jsonld', $json);
    return new WP_REST_Response(['ok' => true]);
}

function sean_bridge_jsonld(): void
{
    if (!is_singular()) {
        return;
    }
    $raw = get_post_meta(get_the_ID(), '_sean_jsonld', true);
    if (!is_string($raw) || $raw === '' || $raw === '[]' || $raw === 'null') {
        return;
    }
    echo '<script type="application/ld+json">' . $raw . '</script>' . "\n";
}

function sean_bridge_media_alt(WP_REST_Request $req): WP_REST_Response
{
    $id = (int) $req['id'];
    $body = $req->get_json_params();
    $alt = is_array($body) ? sanitize_text_field((string) ($body['alt'] ?? '')) : '';
    update_post_meta($id, '_wp_attachment_image_alt', $alt);
    return new WP_REST_Response(['ok' => true, 'id' => $id, 'alt' => $alt]);
}

function sean_bridge_restore_revision(WP_REST_Request $req): WP_REST_Response|WP_Error
{
    $id = (int) $req['id'];
    $rev = wp_restore_post_revision($id);
    if (!$rev) {
        return new WP_Error('restore_failed', 'Could not restore revision', ['status' => 400]);
    }
    return new WP_REST_Response(['ok' => true, 'postId' => $rev]);
}

add_filter('pre_get_document_title', static function ($title) {
    if (!is_singular()) {
        return $title;
    }
    $custom = get_post_meta(get_the_ID(), '_sean_seo_title', true);
    return is_string($custom) && $custom !== '' ? $custom : $title;
}, 20);
