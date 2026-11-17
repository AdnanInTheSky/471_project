const { clearAuthCookie, sendJson } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
  clearAuthCookie(res);
  return sendJson(res, 200, { message: 'Logged out successfully.' });
};
