package com.naranote.library;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.naranote.kanji.Kanji;
import com.naranote.kanji.KanjiRepository;
import com.naranote.user.CurrentUser;
import com.naranote.vocab.RecognitionWordService;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class KanjiLibraryServiceTest {

    @Mock
    private KanjiLibraryRepository libraryRepository;

    @Mock
    private KanjiRepository kanjiRepository;

    @Mock
    private CurrentUser currentUser;

    @Mock
    private RecognitionWordService recognitionWordService;

    private KanjiLibraryService service;

    @BeforeEach
    void setUp() {
        when(currentUser.id()).thenReturn(1L);
        service =
                new KanjiLibraryService(
                        libraryRepository, kanjiRepository, currentUser, recognitionWordService);
    }

    private Kanji mockKanji(String literal) {
        Kanji kanji = mock(Kanji.class);
        when(kanji.getLiteral()).thenReturn(literal);
        return kanji;
    }

    @Test
    void addBatch_handlesNewAlreadySavedAndUnknownCharacters() {
        // Given literals: "漢", "字", "猫", "𩸽", and duplicates
        List<String> input = List.of("漢", "字", "猫", "𩸽", "漢");

        // "漢", "字", "猫" exist in dictionary; "𩸽" does not
        Kanji kanjiHan = mockKanji("漢");
        Kanji kanjiJi = mockKanji("字");
        Kanji kanjiNeko = mockKanji("猫");

        when(kanjiRepository.findAllById(List.of("漢", "字", "猫", "𩸽")))
                .thenReturn(List.of(kanjiHan, kanjiJi, kanjiNeko));

        // "漢" is already in the user's library
        KanjiLibraryEntry existingHan = new KanjiLibraryEntry(1L, "漢", "MANUAL");
        when(libraryRepository.findByIdUserIdOrderByAddedAtDesc(1L))
                .thenReturn(List.of(existingHan));

        // When
        KanjiLibraryService.BatchResult result = service.addBatch(input);

        // Then
        assertThat(result.added()).isEqualTo(2); // "字", "猫"
        assertThat(result.alreadySaved()).isEqualTo(1); // "漢"
        assertThat(result.notFound()).isEqualTo(1); // "𩸽"
        assertThat(result.notFoundLiterals()).containsExactly("𩸽");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<KanjiLibraryEntry>> captor = ArgumentCaptor.forClass(List.class);
        verify(libraryRepository).saveAllAndFlush(captor.capture());

        List<KanjiLibraryEntry> saved = captor.getValue();
        assertThat(saved).hasSize(2);
        assertThat(saved.get(0).getId().getLiteral()).isEqualTo("字");
        assertThat(saved.get(0).getSource()).isEqualTo("BATCH");
        assertThat(saved.get(1).getId().getLiteral()).isEqualTo("猫");
        assertThat(saved.get(1).getSource()).isEqualTo("BATCH");
    }

    @Test
    void addBatch_whenAllAlreadySaved_doesNotCallSaveAll() {
        List<String> input = List.of("漢");

        Kanji kanjiHan = mockKanji("漢");
        when(kanjiRepository.findAllById(List.of("漢"))).thenReturn(List.of(kanjiHan));

        KanjiLibraryEntry existingHan = new KanjiLibraryEntry(1L, "漢", "MANUAL");
        when(libraryRepository.findByIdUserIdOrderByAddedAtDesc(1L)).thenReturn(List.of(existingHan));

        KanjiLibraryService.BatchResult result = service.addBatch(input);

        assertThat(result.added()).isEqualTo(0);
        assertThat(result.alreadySaved()).isEqualTo(1);
        assertThat(result.notFound()).isEqualTo(0);
        assertThat(result.notFoundLiterals()).isEmpty();

        verify(libraryRepository, never()).saveAllAndFlush(anyList());
    }
}
