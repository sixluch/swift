export function TypingIndicator() {
  return (
    <div className="flex w-full justify-start">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-navy-800 px-4 py-3">
        <span className="sr-only">Assistant is typing</span>
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            style={{ animationDelay: `${delay}ms` }}
            className="size-1.5 animate-bounce rounded-full bg-slate-400"
          />
        ))}
      </div>
    </div>
  );
}
