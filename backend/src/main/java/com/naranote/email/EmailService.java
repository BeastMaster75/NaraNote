package com.naranote.email;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

/**
 * The one place that talks to SMTP. Failures are logged, not thrown — a misconfigured or
 * temporarily-down mail server shouldn't take registration or password reset down with it;
 * the account/token still exists and the user can hit "resend" once mail is working (see
 * {@code AuthController.resendVerification}/{@code forgotPassword}).
 */
@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);

    private final JavaMailSender mailSender;
    private final String from;
    private final String appBaseUrl;

    public EmailService(
            JavaMailSender mailSender,
            @Value("${naranote.mail.from}") String from,
            @Value("${naranote.app-base-url}") String appBaseUrl) {
        this.mailSender = mailSender;
        this.from = from;
        this.appBaseUrl = appBaseUrl;
    }

    public void sendVerificationEmail(String toEmail, String displayName, String token) {
        String link = verifyLink(token);
        send(
                toEmail,
                EmailTemplates.verificationSubject(),
                EmailTemplates.verificationPlainText(displayName, link),
                EmailTemplates.verificationHtml(displayName, link));
    }

    public void sendPasswordResetEmail(String toEmail, String displayName, String token) {
        String link = resetLink(token);
        send(
                toEmail,
                EmailTemplates.passwordResetSubject(),
                EmailTemplates.passwordResetPlainText(displayName, link),
                EmailTemplates.passwordResetHtml(displayName, link));
    }

    private String verifyLink(String token) {
        return appBaseUrl + "/verify-email?token=" + URLEncoder.encode(token, StandardCharsets.UTF_8);
    }

    private String resetLink(String token) {
        return appBaseUrl + "/reset-password?token=" + URLEncoder.encode(token, StandardCharsets.UTF_8);
    }

    private void send(String toEmail, String subject, String plainText, String html) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setTo(toEmail);
            helper.setFrom(from);
            helper.setSubject(subject);
            helper.setText(plainText, html);
            mailSender.send(message);
            log.info("Sent \"{}\" to {}", subject, toEmail);
        } catch (MessagingException | MailException e) {
            log.error("Failed to send \"{}\" to {}: {}", subject, toEmail, e.getMessage());
        }
    }
}
