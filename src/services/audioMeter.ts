export class AudioMeter {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private animFrameId: number | null = null;
  private onLevelUpdate: (level: number, isSpeaking: boolean) => void;
  private isDestroyed = false;

  constructor(onLevelUpdate: (level: number, isSpeaking: boolean) => void) {
    this.onLevelUpdate = onLevelUpdate;
  }

  public attachStream(stream: MediaStream) {
    this.detach();

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();

      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.6;

      this.source = this.audioContext.createMediaStreamSource(stream);
      this.source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkAudioLevel = () => {
        if (this.isDestroyed || !this.analyser) return;

        this.analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }

        const average = sum / bufferLength;
        const normalized = Math.min(1, Math.max(0, average / 128));
        const isSpeaking = normalized > 0.08;

        this.onLevelUpdate(normalized, isSpeaking);

        this.animFrameId = requestAnimationFrame(checkAudioLevel);
      };

      checkAudioLevel();
    } catch (err) {
      console.warn('AudioContext visualization initialization failed:', err);
    }
  }

  public detach() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.source) {
      try {
        this.source.disconnect();
      } catch (e) {
        // ignore
      }
      this.source = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch (e) {
        // ignore
      }
      this.audioContext = null;
    }
    this.analyser = null;
    this.onLevelUpdate(0, false);
  }

  public destroy() {
    this.isDestroyed = true;
    this.detach();
  }
}
