package com.naranote.library;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class KanjiLibraryControllerTest {

    @Mock
    private KanjiLibraryService libraryService;

    @InjectMocks
    private KanjiLibraryController controller;

    @Test
    void addBatch_delegatesToService() {
        var literals = List.of("漢", "字");
        var expected = new KanjiLibraryService.BatchResult(2, 0, 0, List.of());
        when(libraryService.addBatch(literals)).thenReturn(expected);

        var request = new KanjiLibraryController.BatchRequest(literals);
        var actual = controller.addBatch(request);

        assertThat(actual).isEqualTo(expected);
        verify(libraryService).addBatch(literals);
    }
}
