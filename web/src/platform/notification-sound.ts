let audioContext: AudioContext | null = null;

export function playNotificationSound(): void {
  try {
    const Context = window.AudioContext;
    audioContext ??= new Context();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.00001,
      audioContext.currentTime + 0.12,
    );
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.12);
  } catch {
    // Audio can be blocked until the first user gesture; notifications still work.
  }
}
