import { Component, ElementRef, OnInit, ViewChild, OnDestroy, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, BehaviorSubject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

type RecordingState = 'inactive' | 'recording' | 'paused';

interface RecordingSegment {
  type: 'camera' | 'screen';
  blobs: Blob[];
  url?: string;
}

interface Resolution {
  label: string;
  width: number;
  height: number;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit, OnDestroy {
  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;

  private mediaRecorder: MediaRecorder | null = null;

  private destroy$ = new Subject<void>();
  recordingState$ = new BehaviorSubject<RecordingState>('inactive');
  mimeType$ = new BehaviorSubject<string>('');
  recentBlobSize$ = new BehaviorSubject<number>(0);
  stream$ = new BehaviorSubject<MediaStream | null>(null);

  recordingSegments: RecordingSegment[] = [];

  resolutions: Resolution[] = [
    { label: '720p', width: 1280, height: 720 },
    { label: '1080p', width: 1920, height: 1080 },
  ];
  selectedResolution: Resolution = this.resolutions[0];

  constructor(private ngZone: NgZone) {}

  ngOnInit() {
    this.initializeStream();

    // Subscribe to stream changes
    this.stream$.pipe(takeUntil(this.destroy$)).subscribe(stream => {
      if (stream) {
        this.startPreview(stream);
      }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.stopAllStreams();
  }

  private async initializeStream() {
    try {
      const stream = await this.getMediaStream('camera');
      this.stream$.next(stream);
    } catch (err) {
      this.handleError(err);
    }
  }

  private async getMediaStream(type: 'camera' | 'screen'): Promise<MediaStream> {
    const { width, height } = this.selectedResolution;
    const constraints: MediaStreamConstraints = {
      video: {
        width: { ideal: width },
        height: { ideal: height },
        aspectRatio: width / height,
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 44100
      }
    };

    if (type === 'camera') {
      (constraints.video as MediaTrackConstraints).facingMode = 'user';
      return navigator.mediaDevices.getUserMedia(constraints);
    } else {
      return navigator.mediaDevices.getDisplayMedia(constraints);
    }
  }

  private startPreview(stream: MediaStream) {
    const video = this.videoElement.nativeElement;
    video.srcObject = stream;
    video.muted = true;
    video.play().catch(error => this.handleError('Error playing video: ' + error));
  }

  async startRecording() {
    const stream = this.stream$.getValue();
    if (!stream) return;

    const options: MediaRecorderOptions = { mimeType: this.getSupportedMimeType() };
    this.mimeType$.next(options.mimeType || '');

    try {
      this.mediaRecorder = new MediaRecorder(stream, options);
    } catch (e) {
      this.handleError('MediaRecorder initialization failed: ' + e);
      return;
    }

    const currentSegment: RecordingSegment = {
      type: stream.getVideoTracks()[0].label.toLowerCase().includes('screen') ? 'screen' : 'camera',
      blobs: [],
    };

    this.recordingSegments.push(currentSegment);

    this.mediaRecorder.ondataavailable = (event) => {
      this.ngZone.run(() => {
        if (event.data.size > 0) {
          currentSegment.blobs.push(event.data);
          this.recentBlobSize$.next(event.data.size);
        }
      });
    };

    this.mediaRecorder.onstop = () => {
      this.ngZone.run(() => {
        const superBuffer = new Blob(currentSegment.blobs, { type: options.mimeType });
        currentSegment.url = URL.createObjectURL(superBuffer);
        this.recordingState$.next('inactive');
      });
    };

    this.mediaRecorder.start();
    this.recordingState$.next('recording');
  }

  stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      this.recordingState$.next('inactive');
    }
  }

  pauseRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
      this.recordingState$.next('paused');
    }
  }

  resumeRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
      this.recordingState$.next('recording');
    }
  }

  async startScreenShare() {
    this.stopRecording();
    this.stopAllStreams();

    try {
      const stream = await this.getMediaStream('screen');
      this.stream$.next(stream);
      this.startRecording();

      const screenTrack = stream.getVideoTracks()[0];
      screenTrack.onended = () => this.ngZone.run(()=> this.switchToCamera());
    } catch (error) {
      this.handleError('Error accessing screen: ' + error);
    }
  }

  async switchToCamera() {
    this.stopRecording();
    this.stopAllStreams();

    try {
      const stream = await this.getMediaStream('camera');
      this.stream$.next(stream);
      this.startRecording();
    } catch (error) {
      this.handleError('Error switching to camera: ' + error);
    }
  }

  private stopAllStreams() {
    const currentStream = this.stream$.getValue();

    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
      this.stream$.next(null);
    }
  }

  getSegmentSize(segment: RecordingSegment): number {
    return segment.blobs.reduce((acc, blob) => acc + blob.size, 0);
  }

  downloadSegment(segment: RecordingSegment) {
    if (!segment.url) return;
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = segment.url;
    a.download = `segment-${segment.type}-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  isIOS(): boolean {
    // @ts-ignore
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  getSupportedMimeType(): string {
    const mimeTypes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp8,vp9,opus',
      'video/webm;codecs=vp8',
      'video/mp4;codecs=h264,aac',
      'video/mp4',
    ];

    for (const mimeType of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        return mimeType;
      }
    }

    this.handleError('No supported MIME type found for MediaRecorder.');
    return '';
  }

  handleError(error: any) {
    console.error('Error:', error);
    alert('An error occurred: ' + error); // debugging ios safari is annoying, sue me
  }

  // Handle resolution changes
  async onResolutionChange() {
    this.stopRecording();
    this.stopAllStreams();
    await this.initializeStream();
  }
}
