/**
 * Tandem health check — GET /
 * Visit your Vercel URL in a browser to confirm the deployment is alive.
 */
export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    service: "Tandem",
    tagline: "Your entire stack. One conversation.",
    status: "alive",
    docs: "Open Telegram and send /start to your bot.",
  });
}
