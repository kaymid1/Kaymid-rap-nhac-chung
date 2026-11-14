import React, { useState } from 'react';
import { Plus, Play, Trash2, Music2, Loader2, ListMusic, Lock } from 'lucide-react';
import type { QueueItem } from '../types';
import { extractYouTubeId } from '../utils/youtube';

interface QueuePanelProps {
  currentItem: QueueItem | null;
  queue: QueueItem[];
  canAddQueue: boolean;
  onAddTrack: (track: {
    videoId: string;
    title: string;
    authorName: string;
    thumbnailUrl: string;
  }) => void;
  onPlayNow: (itemId: string) => void;
  onRemoveTrack: (itemId: string) => void;
}

export const QueuePanel: React.FC<QueuePanelProps> = ({
  currentItem,
  queue,
  canAddQueue,
  onAddTrack,
  onPlayNow,
  onRemoveTrack,
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [failedThumbIds, setFailedThumbIds] = useState<Set<string>>(new Set());

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAddQueue) return;
    const videoId = extractYouTubeId(urlInput);
    if (!videoId) {
      setError('Không nhận diện được link YouTube. Hãy dán link youtube.com hoặc youtu.be.');
      return;
    }

    setError('');
    setIsLoading(true);
    try {
      const resp = await fetch(`/api/oembed?videoId=${encodeURIComponent(videoId)}`);
      const data = (await resp.json()) as {
        videoId?: string;
        title?: string;
        authorName?: string;
        thumbnailUrl?: string;
        error?: string;
      };

      if (!resp.ok || !data.title) {
        setError(data.error || 'Không thể lấy thông tin video YouTube này.');
        return;
      }

      onAddTrack({
        videoId,
        title: data.title,
        authorName: data.authorName || 'YouTube',
        thumbnailUrl: data.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      });
      setUrlInput('');
    } catch {
      setError('Lỗi kết nối khi lấy thông tin video. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  const markThumbFailed = (id: string) => {
    setFailedThumbIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  return (
    <section
      aria-label="Danh sách phát chung"
      className="rounded-2xl border border-[#D4AF37]/25 bg-[#13080C] p-4 flex flex-col gap-4 shadow-xl"
    >
      <div className="flex items-center justify-between gap-2 border-b border-[#D4AF37]/15 pb-3">
        <div className="flex items-center gap-2">
          <ListMusic className="w-4 h-4 text-[#D4AF37]" />
          <h3
            style={{ fontFamily: 'var(--font-display)' }}
            className="text-base font-semibold text-[#FDE68A]"
          >
            Danh sách chờ
          </h3>
        </div>
        <span className="text-xs font-mono tabular-nums text-[#A89888]">
          {queue.length} bài tiếp theo
        </span>
      </div>

      {/* Add YouTube URL Form */}
      {canAddQueue ? (
        <form onSubmit={handleAdd} className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => {
                setUrlInput(e.target.value);
                if (error) setError('');
              }}
              placeholder="Dán link YouTube (youtube.com, youtu.be)..."
              aria-label="Dán đường dẫn video YouTube"
              className="flex-1 min-w-0 rounded-xl border border-[#D4AF37]/25 bg-[#0B0608] px-3 py-2.5 text-xs text-[#F5EFE6] placeholder:text-[#78685C] focus:outline-none focus:border-[#D4AF37] transition-colors"
            />
            <button
              type="submit"
              disabled={isLoading || !urlInput.trim()}
              className="px-3.5 py-2.5 rounded-xl bg-[#991B1B] hover:bg-[#B91C1C] border border-[#D4AF37]/40 text-xs font-medium text-[#FBF7F0] flex items-center gap-1.5 disabled:opacity-45 cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              {isLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5 text-[#FDE68A]" />
              )}
              <span>Thêm</span>
            </button>
          </div>
          {error && (
            <p role="alert" className="text-xs text-red-300">
              {error}
            </p>
          )}
        </form>
      ) : (
        <div className="rounded-xl border border-[#D4AF37]/15 bg-[#0E0609] px-3 py-2.5 flex items-center gap-2 text-xs text-[#A89888]">
          <Lock className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
          <span>Chủ phòng đang tắt quyền thêm hoặc sửa danh sách phát của bạn.</span>
        </div>
      )}

      {/* Now Playing Summary */}
      {currentItem && (
        <div className="rounded-xl border border-[#D4AF37]/25 bg-[#1D0C12] p-2.5 flex items-center gap-3">
          <div className="w-14 h-10 rounded-lg overflow-hidden bg-[#0B0608] shrink-0 flex items-center justify-center border border-white/10">
            {failedThumbIds.has(currentItem.id) ? (
              <Music2 className="w-4 h-4 text-[#D4AF37]" />
            ) : (
              <img
                src={currentItem.thumbnailUrl}
                alt={currentItem.title}
                referrerPolicy="no-referrer"
                onError={() => markThumbFailed(currentItem.id)}
                className="w-full h-full object-cover"
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium text-[#D4AF37]">Đang chiếu</div>
            <div className="text-xs font-medium text-[#FBF7F0] truncate" title={currentItem.title}>
              {currentItem.title}
            </div>
            <div className="text-[11px] text-[#8E7D70] truncate">
              {currentItem.authorName} · {currentItem.addedBy}
            </div>
          </div>
        </div>
      )}

      {/* Up Next List */}
      <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
        {queue.length === 0 ? (
          <div className="py-6 text-center text-xs text-[#8E7D70]">
            Chưa có bài hát nào trong hàng chờ.
          </div>
        ) : (
          queue.map((item, idx) => (
            <div
              key={item.id}
              className="group rounded-xl border border-white/5 bg-[#0E0609] hover:border-[#D4AF37]/25 p-2 flex items-center gap-2.5 transition-colors"
            >
              <span className="text-[11px] font-mono tabular-nums text-[#8E7D70] w-4 text-center shrink-0">
                {idx + 1}
              </span>
              <div className="w-12 h-9 rounded-md overflow-hidden bg-[#180B10] shrink-0 flex items-center justify-center">
                {failedThumbIds.has(item.id) ? (
                  <Music2 className="w-4 h-4 text-[#D4AF37]/70" />
                ) : (
                  <img
                    src={item.thumbnailUrl}
                    alt={item.title}
                    referrerPolicy="no-referrer"
                    onError={() => markThumbFailed(item.id)}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-[#F5EFE6] truncate" title={item.title}>
                  {item.title}
                </div>
                <div className="text-[11px] text-[#8E7D70] truncate">
                  Thêm bởi {item.addedBy}
                </div>
              </div>
              {canAddQueue && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onPlayNow(item.id)}
                    title="Phát ngay bài này"
                    aria-label={`Phát ngay ${item.title}`}
                    className="p-1.5 rounded-lg text-[#C7B8A6] hover:text-[#FDE68A] hover:bg-[#241016] cursor-pointer transition-colors"
                  >
                    <Play className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveTrack(item.id)}
                    title="Xóa khỏi hàng chờ"
                    aria-label={`Xóa ${item.title}`}
                    className="p-1.5 rounded-lg text-[#8E7D70] hover:text-red-300 hover:bg-red-950/40 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
};
