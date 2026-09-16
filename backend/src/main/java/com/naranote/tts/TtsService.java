package com.naranote.tts;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

/**
 * Generates and caches word-reading audio. VOICEVOX synthesis is a two-step HTTP call
 * (query, then synthesis from that query), so a cache hit — the common case once a reading
 * has been played once by anyone — skips both and returns straight from {@code tts_audio}.
 */
@Service
public class TtsService {

    private final JdbcTemplate jdbc;
    private final RestClient voicevox;
    private final int speakerId;

    public TtsService(
            JdbcTemplate jdbc,
            @Value("${naranote.voicevox.url}") String voicevoxUrl,
            @Value("${naranote.voicevox.speaker-id}") int speakerId) {
        this.jdbc = jdbc;
        this.voicevox = RestClient.create(voicevoxUrl);
        this.speakerId = speakerId;
    }

    public byte[] speak(String text) {
        byte[] cached = jdbc
                .query(
                        "select audio from tts_audio where text = ? and speaker_id = ?",
                        (rs, i) -> rs.getBytes("audio"),
                        text,
                        speakerId)
                .stream()
                .findFirst()
                .orElse(null);
        if (cached != null) {
            return cached;
        }

        byte[] audio = synthesize(text);
        jdbc.update(
                "insert into tts_audio (text, speaker_id, audio) values (?, ?, ?)"
                        + " on conflict (text, speaker_id) do nothing",
                text,
                speakerId,
                audio);
        return audio;
    }

    private byte[] synthesize(String text) {
        String audioQuery = voicevox
                .post()
                .uri(uri -> uri.path("/audio_query")
                        .queryParam("speaker", speakerId)
                        .queryParam("text", text)
                        .build())
                .retrieve()
                .body(String.class);

        return voicevox
                .post()
                .uri(uri -> uri.path("/synthesis").queryParam("speaker", speakerId).build())
                .contentType(MediaType.APPLICATION_JSON)
                .body(audioQuery)
                .retrieve()
                .body(byte[].class);
    }
}
