interface MeetBotWindow {
  __saveChunk: (data: string) => void;
  __sendAudioChunk: (data: string) => void;
  __finishRecording: () => Promise<void>;
  _mediaRecorder?: MediaRecorder;
  _audioRecorder?: MediaRecorder;
  _recordingStream?: MediaStream;
  _audioScanTimer?: number;
  _audioCtx?: AudioContext;
}

interface DisplayMediaOptions extends DisplayMediaStreamOptions {
  preferCurrentTab?: boolean;
}

declare global {
  interface Window extends MeetBotWindow {}
  interface MediaDevices {
    getDisplayMedia(options?: DisplayMediaOptions): Promise<MediaStream>;
  }
}

export {};
