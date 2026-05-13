interface MeetBotWindow {
  __saveChunk: (data: string) => void;
  __sendAudioChunk: (data: string) => void;
  __finishRecording: () => Promise<void>;
  _mediaRecorder?: MediaRecorder;
  _audioRecorder?: MediaRecorder;
  _recordingStream?: MediaStream;
  _audioScanTimer?: number;
  _audioCtx?: AudioContext;

  // Speaker timeline
  __pcs?: RTCPeerConnection[];
  __speakerEvent: (line: string) => void;
  __speakerStop?: () => void;
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
