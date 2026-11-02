let audioContext: AudioContext | null = null;

function playTone(context: AudioContext): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.08, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(
    0.00001,
    context.currentTime + 0.12,
  );
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.12);
}

export function playNotificationSound(): void {
  try {
    const Context = window.AudioContext;
    audioContext ??= new Context();
    if (audioContext.state === "suspended") {
      void audioContext
        .resume()
        .then(() => playTone(audioContext!))
        .catch(() => undefined);
      return;
    }
    playTone(audioContext);
  } catch {
    // Audio can be blocked until the first user gesture; notifications still work.
  }
}
