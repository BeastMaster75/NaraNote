package com.naranote.email;

import org.springframework.web.util.HtmlUtils;

/**
 * The actual copy and markup for outbound mail, kept out of {@link EmailService} so the
 * two verification/reset emails are easy to find and edit as their own thing rather than
 * buried in the class that talks to SMTP.
 *
 * <p>Table-based layout and inline styles throughout — the only markup that survives Gmail,
 * Outlook and everything between them stripping {@code <style>} blocks and CSS Grid/Flexbox.
 * Colours are the light-theme hanami palette's raw hex values (see
 * {@code frontend/src/styles/tokens.css}), copied rather than referenced because an email has
 * no CSS variables and no dark-mode media query worth trusting across clients.
 */
final class EmailTemplates {

    private EmailTemplates() {}

    static String verificationSubject() {
        return "Verify your email for NaraNote";
    }

    static String verificationPlainText(String displayName, String link) {
        return """
                Hi %s,

                Thanks for creating a NaraNote account. Confirm this is your email address to \
                finish setting up your account:

                %s

                This link expires in 24 hours. If you didn't create a NaraNote account, you can \
                safely ignore this email — nothing happens unless the link above is opened.

                — NaraNote"""
                .formatted(displayName, link);
    }

    static String verificationHtml(String displayName, String link) {
        return layout(
                "Verify Your Email",
                "Hi " + HtmlUtils.htmlEscape(displayName) + ",",
                "Thanks for creating a NaraNote account. Confirm this is your email address to"
                        + " finish setting up your account.",
                "Verify Email Address",
                link,
                "This link expires in 24 hours. If you didn't create a NaraNote account, you can"
                        + " safely ignore this email — nothing happens unless the button above is"
                        + " clicked.");
    }

    static String passwordResetSubject() {
        return "Reset your NaraNote password";
    }

    static String passwordResetPlainText(String displayName, String link) {
        return """
                Hi %s,

                We received a request to reset the password for this NaraNote account. Choose a \
                new password here:

                %s

                This link expires in 1 hour and can only be used once. If you didn't ask to reset \
                your password, you can safely ignore this email — your password won't change \
                unless the link above is used.

                — NaraNote"""
                .formatted(displayName, link);
    }

    static String passwordResetHtml(String displayName, String link) {
        return layout(
                "Reset Your Password",
                "Hi " + HtmlUtils.htmlEscape(displayName) + ",",
                "We received a request to reset the password for this NaraNote account. Choose a"
                        + " new password by following the link below.",
                "Reset Password",
                link,
                "This link expires in 1 hour and can only be used once. If you didn't ask to reset"
                        + " your password, you can safely ignore this email — your password won't"
                        + " change unless the button above is used.");
    }

    /**
     * The shared card: wordmark header, a greeting + one paragraph of body copy, a pill
     * button, then a fine-print safety note and the raw URL as a fallback for clients that
     * strip the button's styling. {@code intro}/{@code note} are pre-escaped by callers that
     * interpolate user data (the display name); {@code buttonLabel} is always a literal.
     */
    private static String layout(
            String title, String greeting, String body, String buttonLabel, String link, String note) {
        String safeLink = HtmlUtils.htmlEscape(link);
        return """
                <!doctype html>
                <html lang="en">
                  <body style="margin:0; padding:0; background-color:#f3ded7; \
                font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                    <span style="display:none; max-height:0; overflow:hidden; opacity:0;">%s</span>
                    <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" \
                style="background-color:#f3ded7; padding:32px 16px;">
                      <tr>
                        <td align="center">
                          <table role="presentation" width="480" cellpadding="0" cellspacing="0" \
                style="max-width:480px; width:100%%; background-color:#fffaf8; border:1px solid #e6c9c0; \
                border-radius:18px; overflow:hidden;">
                            <tr>
                              <td style="padding:36px 40px 20px; text-align:center; \
                border-bottom:1px solid #e6c9c0;">
                                <div style="font-family:'Hiragino Kaku Gothic ProN','Hiragino Sans',\
                'Yu Gothic',Meiryo,sans-serif; font-size:15px; letter-spacing:0.08em; color:#c9506b; \
                font-weight:700;">ナラノート</div>
                                <div style="font-size:20px; font-weight:700; color:#2b1f22; \
                margin-top:4px;">NaraNote</div>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding:28px 40px 0; color:#2b1f22; font-size:15px; \
                line-height:1.6;">
                                <p style="margin:0 0 16px;">%s</p>
                                <p style="margin:0 0 24px;">%s</p>
                              </td>
                            </tr>
                            <tr>
                              <td align="center" style="padding:0 40px 28px;">
                                <a href="%s" style="display:inline-block; background-color:#c9506b; \
                color:#fff8f5; text-decoration:none; font-weight:700; font-size:14px; \
                padding:14px 36px; border-radius:999px;">%s</a>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding:0 40px 28px; color:#7a6169; font-size:13px; \
                line-height:1.6;">
                                <p style="margin:0 0 12px;">%s</p>
                                <p style="margin:0;">Or copy and paste this URL into your browser:</p>
                                <p style="margin:6px 0 0; word-break:break-all; \
                background-color:#f3ded7; border-radius:10px; padding:10px 14px; font-size:12px; \
                color:#2b1f22;">%s</p>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding:20px 40px 32px; border-top:1px solid #e6c9c0; \
                text-align:center; color:#998088; font-size:12px;">
                                Collect the Japanese You Meet.
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </body>
                </html>"""
                .formatted(title, greeting, body, safeLink, buttonLabel, note, safeLink);
    }
}
