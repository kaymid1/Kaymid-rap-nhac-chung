import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import type { ChatMessage } from '../types';

interface ChatPanelProps {
  messages: ChatMessage[];
  selfId: string | null;
  onSendMessage: (text: string) => void;
}

function formatClockTime(ts: number): string {
  const date = new Date(ts);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ messages, selfId, onSendMessage }) => {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setText('');
  };

  return (
    <section
      aria-label="Trò chuyện trực tiếp"
      className="rounded-2xl border border-[#D4AF37]/25 bg-[#13080C] p-4 flex flex-col gap-3 shadow-xl flex-1 min-h-[280px]"
    >
      <div className="flex items-center justify-between border-b border-[#D4AF37]/15 pb-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#D4AF37]" />
          <h3
            style={{ fontFamily: 'var(--font-display)' }}
            className="text-base font-semibold text-[#FDE68A]"
          >
            Trò chuyện trực tiếp
          </h3>
        </div>
        <span className="text-xs font-mono tabular-nums text-[#8E7D70]">
          {messages.length} tin
        </span>
      </div>

      {/* Messages Feed */}
      <div
        ref={listRef}
        className="flex-1 min-h-[160px] max-h-[280px] overflow-y-auto space-y-2.5 pr-1"
      >
        {messages.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#8E7D70]">
            Gửi lời chào đến mọi người trong rạp...
          </div>
        ) : (
          messages.map((msg) => {
            if (msg.isSystem) {
              return (
                <div
                  key={msg.id}
                  className="text-[11px] text-[#A89888] py-0.5 flex items-baseline justify-between gap-2"
                >
                  <span className="italic">{msg.text}</span>
                  <span className="font-mono tabular-nums text-[10px] text-[#6E5F54] shrink-0">
                    {formatClockTime(msg.timestamp)}
                  </span>
                </div>
              );
            }

            const isSelf = msg.userId === selfId;
            return (
              <div key={msg.id} className="text-xs leading-relaxed">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/30"
                      style={{ backgroundColor: msg.shirtColor }}
                    />
                    <span
                      className={`font-semibold truncate ${
                        isSelf ? 'text-[#FDE68A]' : 'text-[#E5D9C8]'
                      }`}
                    >
                      {msg.userName}
                    </span>
                  </div>
                  <span className="font-mono tabular-nums text-[10px] text-[#6E5F54] shrink-0">
                    {formatClockTime(msg.timestamp)}
                  </span>
                </div>
                <p className="text-[#D6C9BA] pl-4 break-words">{msg.text}</p>
              </div>
            );
          })
        )}
      </div>

      {/* Message Input */}
      <form onSubmit={handleSubmit} className="flex gap-2 pt-1 border-t border-[#D4AF37]/10">
        <input
          type="text"
          maxLength={300}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Nhắn tin với cả rạp..."
          aria-label="Nội dung tin nhắn"
          className="flex-1 min-w-0 rounded-xl border border-[#D4AF37]/25 bg-[#0B0608] px-3 py-2 text-xs text-[#F5EFE6] placeholder:text-[#78685C] focus:outline-none focus:border-[#D4AF37] transition-colors"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          aria-label="Gửi tin nhắn"
          className="px-3 py-2 rounded-xl bg-[#241016] hover:bg-[#361620] border border-[#D4AF37]/30 text-[#FDE68A] disabled:opacity-40 cursor-pointer transition-colors shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </section>
  );
};
