import { create } from 'zustand';

export const automaticTrackingKeys = {
  status: ['automatic-tracking', 'status'] as const,
  history: (query?: unknown) =>
    ['automatic-tracking', 'history', query ?? {}] as const,
  review: (query?: unknown) =>
    ['automatic-tracking', 'review', query ?? {}] as const,
  reviewItem: (id: string) => ['automatic-tracking', 'review', id] as const,
  duplicate: (id: string) => ['automatic-tracking', 'duplicate', id] as const,
  duplicates: () => ['automatic-tracking', 'duplicates'] as const,
  keywords: (query?: unknown) =>
    ['automatic-tracking', 'keywords', query ?? {}] as const,
  senders: (query?: unknown) =>
    ['automatic-tracking', 'senders', query ?? {}] as const
};

interface TrackingFilters {
  historySearch: string;
  reviewSearch: string;
  senderSearch: string;
  setHistorySearch: (value: string) => void;
  setReviewSearch: (value: string) => void;
  setSenderSearch: (value: string) => void;
}

export const useAutomaticTrackingFilters = create<TrackingFilters>((set) => ({
  historySearch: '',
  reviewSearch: '',
  senderSearch: '',
  setHistorySearch: (historySearch) => set({ historySearch }),
  setReviewSearch: (reviewSearch) => set({ reviewSearch }),
  setSenderSearch: (senderSearch) => set({ senderSearch })
}));
