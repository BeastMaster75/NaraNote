package com.naranote.user;

import com.naranote.security.CryptoService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.ArrayList;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The signed-in user and their preferences.
 *
 * <p>There is still no authentication — {@link CurrentUser} returns the single
 * seeded local user, and this controller reads and writes that row. The shape of
 * the endpoint is what real accounts would use unchanged, so adding auth later
 * means changing who {@code CurrentUser} resolves to, not this.
 */
@RestController
@RequestMapping("/api/me")
public class UserController {

    /**
     * Every value the client needs to render the app for this user. {@code hasGeminiKey} is
     * a presence check, never the key itself — same reason {@code password_hash} never
     * appears here, this is the object the frontend stores in state and renders freely.
     */
    public record Me(
            String displayName,
            String theme,
            boolean furigana,
            int sessionSize,
            int targetJlptLevel,
            boolean hasGeminiKey) {}

    /**
     * A patch: every field is optional and null means "leave it alone". Sending
     * the whole object back would make two settings screens open at once fight,
     * with the last save silently reverting the other's change.
     *
     * <p>{@code geminiApiKey} breaks that convention slightly on purpose: null still means
     * leave it alone, but an empty string means "clear it" rather than being rejected —
     * "leave alone" and "unset" have to be distinguishable, and the current encrypted value
     * is never decrypted just to write the same thing back unchanged.
     */
    public record UpdateMe(
            @Size(min = 1, max = 80) String displayName,
            @Pattern(regexp = "system|light|dark") String theme,
            Boolean furigana,
            @Min(5) @Max(100) Integer sessionSize,
            // 0 means "no target set" — the real value clears it, since null here means
            // "leave alone", not "unset".
            @Min(0) @Max(5) Integer targetJlptLevel,
            @Size(max = 200) String geminiApiKey) {}

    private static final String SELECT =
            """
            select display_name, theme, furigana, session_size, target_jlpt_level,
                   gemini_api_key is not null as has_gemini_key
            from app_user where id = ?
            """;

    private final JdbcTemplate jdbc;
    private final CurrentUser currentUser;
    private final CryptoService crypto;

    public UserController(JdbcTemplate jdbc, CurrentUser currentUser, CryptoService crypto) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.crypto = crypto;
    }

    @GetMapping
    public Me me() {
        return load(currentUser.id());
    }

    @PatchMapping
    @Transactional
    public Me update(@Valid @RequestBody UpdateMe request) {
        long userId = currentUser.id();
        Me current = load(userId);

        String displayName =
                request.displayName() == null
                        ? current.displayName()
                        : request.displayName().strip();
        // A name of nothing but spaces passes @Size but would leave the header
        // with a blank chip, so fall back rather than store it.
        if (displayName.isEmpty()) displayName = current.displayName();

        List<Object> args = new ArrayList<>();
        args.add(displayName);
        args.add(request.theme() == null ? current.theme() : request.theme());
        args.add(request.furigana() == null ? current.furigana() : request.furigana());
        args.add(request.sessionSize() == null ? current.sessionSize() : request.sessionSize());
        args.add(
                request.targetJlptLevel() == null
                        ? current.targetJlptLevel()
                        : request.targetJlptLevel());

        String geminiClause;
        if (request.geminiApiKey() == null) {
            geminiClause = "";
        } else if (request.geminiApiKey().isBlank()) {
            geminiClause = ", gemini_api_key = null";
        } else {
            geminiClause = ", gemini_api_key = ?";
            args.add(crypto.encrypt(request.geminiApiKey()));
        }
        args.add(userId);

        jdbc.update(
                """
                update app_user
                   set display_name = ?, theme = ?, furigana = ?, session_size = ?,
                       target_jlpt_level = ?%s
                 where id = ?
                """
                        .formatted(geminiClause),
                args.toArray());

        return load(userId);
    }

    private Me load(long userId) {
        return jdbc.queryForObject(
                SELECT,
                (rs, row) ->
                        new Me(
                                rs.getString("display_name"),
                                rs.getString("theme"),
                                rs.getBoolean("furigana"),
                                rs.getInt("session_size"),
                                rs.getInt("target_jlpt_level"),
                                rs.getBoolean("has_gemini_key")),
                userId);
    }
}
