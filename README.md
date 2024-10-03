# ng-recording

Build Client Locally: `npm run client:serve`

MediaRecorder implementation supported on all major browsers + mobile

Limitations
- Changing video sources (ex: screen share -> camera) MUST stop the current recording.
The video sources are encoded differently, and could be at different resolutions.
The only consistent solution is to start an entirely new MediaStream with its own tracks
Combining the video tracks into a single playable video is not trivial on the client. Most hacky solutions do not work on all major browsers + mobile.
- Someone's client machine is going to blow up recording multiple MediaStreams. MediaRecorder shouldn't really be used in group recordings unless you're ok with users chunk uploading their media separately to be processed on another server.
Most chunk uploadings have minimum 5MB requirement, so chunked uploads can be hard on bandwidth if lagging behind
