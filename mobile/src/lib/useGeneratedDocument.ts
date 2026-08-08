import { useCallback, useState } from "react";
import { Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { downloadAndSharePdf } from "./downloadAndShare";
import { presetRanges, DateRange } from "./dateRange";

export interface PickerOption {
  id: string;
  label: string;
}

export interface ItemPage<TItem> {
  items: TItem[];
  nextCursor: string | null;
}

export interface UseGeneratedDocumentOptions<TItem> {
  loadPickerOptions: () => Promise<PickerOption[]>;
  loadItems: (cursor?: string) => Promise<ItemPage<TItem>>;
  getItemId: (item: TItem) => string;
  // Caller owns the actual POST — the request body shape (driverId vs
  // businessId) and the response's wrapper key ("report" vs "invoice") are
  // the two places Reports and Invoices are still allowed to differ; the
  // caller unwraps to the created item itself so generate() below can
  // prepend it locally instead of a full reload.
  generateDocument: (pickerId: string, range: { start: Date; end: Date }) => Promise<TItem>;
  pdfPath: (item: TItem) => string;
  pdfFilename: (item: TItem) => string;
  pickerMissingMessage: string;
  loadErrorFallback: string;
  generateErrorFallback: string;
}

// Shared load-on-focus, date-range picker, "Generate" action, and per-item
// "Share / Save PDF" state machine behind ReportsScreen and InvoicesScreen —
// those two screens were otherwise identical apart from the picker's entity
// (driver vs business), the generate request body, and the PDF route. The
// list/form markup itself (labels, which stats a card shows) stays in each
// screen; only the plumbing above is shared here.
export function useGeneratedDocument<TItem>(opts: UseGeneratedDocumentOptions<TItem>) {
  const { session } = useAuth();
  const [pickerOptions, setPickerOptions] = useState<PickerOption[]>([]);
  const [items, setItems] = useState<TItem[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [pickerId, setPickerId] = useState<string | null>(null);
  const ranges = presetRanges();
  const [range, setRange] = useState<DateRange>(ranges[1]);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    try {
      const [options, page] = await Promise.all([opts.loadPickerOptions(), opts.loadItems()]);
      setPickerOptions(options);
      setItems(page.items);
      setNextCursor(page.nextCursor);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : opts.loadErrorFallback);
    } finally {
      setInitialLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.loadPickerOptions, opts.loadItems, opts.loadErrorFallback]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await opts.loadItems(nextCursor);
      setItems((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : opts.loadErrorFallback);
    } finally {
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextCursor, loadingMore, opts.loadItems, opts.loadErrorFallback]);

  // generate/share below are useCallback-wrapped (not plain functions like
  // loadMore) specifically so callers can pass them straight through as a
  // memoized row's onShare prop — see ReportsScreen/InvoicesScreen, which
  // wrap their own row components in React.memo. A plain function here would
  // get a new identity every render regardless, defeating that memoization
  // even though the row component itself is memoized.
  const generate = useCallback(async () => {
    setError(null);
    if (!pickerId) {
      setError(opts.pickerMissingMessage);
      return;
    }
    setGenerating(true);
    try {
      const created = await opts.generateDocument(pickerId, range);
      // Prepend locally instead of calling load() — both /api/reports and
      // /api/invoices order newest-first, so this matches server order
      // exactly, and unlike a full reload it doesn't discard any additional
      // pages already pulled in via "Load More".
      setItems((prev) => [created, ...prev]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : opts.generateErrorFallback);
    } finally {
      setGenerating(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerId, range, opts.generateDocument, opts.pickerMissingMessage, opts.generateErrorFallback]);

  const share = useCallback(
    async (item: TItem) => {
      if (!session) return;
      const id = opts.getItemId(item);
      setSharingId(id);
      try {
        await downloadAndSharePdf(opts.pdfPath(item), session.token, opts.pdfFilename(item));
      } catch (e) {
        // downloadAndSharePdf throws specific messages (timeout, unreachable,
        // a non-2xx status, or whatever the native share sheet reports) — a
        // blanket "check your connection" here hid the real cause even when
        // it had nothing to do with connectivity.
        Alert.alert("Could not open the PDF", e instanceof Error ? e.message : "Check your connection and try again.");
      } finally {
        setSharingId(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, opts.getItemId, opts.pdfPath, opts.pdfFilename]
  );

  return {
    pickerOptions,
    items,
    initialLoading,
    pickerId,
    setPickerId,
    ranges,
    range,
    setRange,
    error,
    generating,
    sharingId,
    generate,
    share,
    hasMore: nextCursor !== null,
    loadingMore,
    loadMore,
  };
}
