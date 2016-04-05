  // if it is iOS, we have to have a user interaction to start Web Audio
  // http://paulbakaus.com/tutorials/html5/web-audio-on-ios/
  var iOS = navigator.userAgent.match(/(iPad|iPhone|iPod)/g) ? true : false;
  if (iOS) {
    var iosStarted = false;
    var startIOS = function () {
      if (iosStarted)
        return;
      // create empty buffer
      var buffer = context.createBuffer(1, 1, 22050);
      var source = context.createBufferSource();
      source.buffer = buffer;
      // connect to output (your speakers)
      source.connect(context.destination);
      // play the file
      source.start(0);
      console.log('start ios!');
      if (context.state === 'running') {
        iosStarted = true;
      }
    };
    document.addEventListener('touchend', startIOS, false);
    document.addEventListener('touchstart', startIOS, false);
  }