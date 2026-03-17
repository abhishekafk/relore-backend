/**
 * Notification utility — Phase 2 stub.
 *
 * Logs notification payloads to console.
 * Phase 6 will replace this with real Expo Push API calls.
 *
 * @param {string} expoPushToken - User's Expo push token (stored in users table in Phase 6)
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Extra data (e.g. { reel_id } for tap-to-open)
 */
async function sendPushNotification(expoPushToken, title, body, data = {}) {
  console.log('[NOTIFY] Push notification (stub — Phase 6 will send real push):', {
    to: expoPushToken || 'no-token-yet',
    title,
    body,
    data,
  });
  // Phase 6 implementation:
  // await fetch('https://exp.host/--/api/v2/push/send', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` },
  //   body: JSON.stringify({ to: expoPushToken, title, body, data, sound: 'default' }),
  // });
}

module.exports = { sendPushNotification };
