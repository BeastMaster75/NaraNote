package com.naranote.reading;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class AozoraTextFetcherTest {

    @Test
    void textFileLink_findsTheTextFileHref() {
        String cardHtml =
                """
                <html><body>
                <table>
                <tr><td>テキストファイル</td>
                <td><a href="files/127_15260.html">127_15260.html</a></td></tr>
                </table>
                </body></html>
                """;

        assertThat(AozoraTextFetcher.textFileLink(cardHtml, "https://www.aozora.gr.jp/cards/000879/card127.html"))
                .isEqualTo("files/127_15260.html");
    }

    @Test
    void textFileLink_throwsWhenNoLinkPresent() {
        assertThatThrownBy(() -> AozoraTextFetcher.textFileLink("<html></html>", "https://example/card1.html"))
                .isInstanceOf(AozoraTextFetcher.AozoraParseException.class);
    }

    @Test
    void stripToPlainText_dropsRubyReadingsButKeepsTheBaseText() {
        String textHtml =
                """
                <html><body>
                <div class="title">羅生門</div>
                <div class="main_text">
                <p>
                或<ruby><rb>日</rb><rp>（</rp><rt>ひ</rt><rp>）</rp></ruby>の暮方の事である。
                一人の<ruby><rb>下人</rb><rp>（</rp><rt>げにん</rt><rp>）</rp></ruby>が、<br />
                羅生門の下で雨やみを待っていた。
                </p>
                </div>
                <div class="bibliographical_information">
                底本：「羅生門・鼻」新潮文庫
                </div>
                </body></html>
                """;

        String plain = AozoraTextFetcher.stripToPlainText(textHtml, "https://example/files/127.html");

        assertThat(plain).contains("或日の暮方の事である。");
        assertThat(plain).contains("一人の下人が、");
        assertThat(plain).contains("羅生門の下で雨やみを待っていた。");
        // The reading itself must not leak into the plain text.
        assertThat(plain).doesNotContain("ひ）");
        assertThat(plain).doesNotContain("げにん");
        // Nor the bibliographic footer, which sits outside main_text.
        assertThat(plain).doesNotContain("底本");
    }

    @Test
    void stripToPlainText_dropsGaijiNotes() {
        String textHtml =
                """
                <div class="main_text">
                <p>その※［＃「魚＋弱」、第3水準1-94-46］はとても大きかった。</p>
                </div>
                """;

        String plain = AozoraTextFetcher.stripToPlainText(textHtml, "https://example/files/1.html");

        assertThat(plain).isEqualTo("そのはとても大きかった。");
    }

    @Test
    void stripToPlainText_throwsOnEmptyExtraction() {
        String textHtml = "<div class=\"main_text\"><rt>ignored</rt></div>";

        assertThatThrownBy(() -> AozoraTextFetcher.stripToPlainText(textHtml, "https://example/files/1.html"))
                .isInstanceOf(AozoraTextFetcher.AozoraParseException.class);
    }
}
