
function Bell() {

  function playSound() {

        var freqs = [525.55, 1685.89, 3805.17, 5968.91, 6297.97, 8634.46, 9605.04, 11767.90, 12201.99, 12423.24];
        var amps = [.026, .015, .394, .065, .254, .280, .05, .03, .03, .028];
        var decays = [4.7, 2, 1.2, 2, .8, 1.1, .9, .5, .95, .55];


    for(var i = 0; i < 3; i++) {
            var o = context.createOscillator();
            var g = context.createGain();

            // set values
         //   o.type = 2;
            o.frequency.value = freqs[i];
            g.gain.setValueAtTime(amps[i] * 3, 0);
            g.gain.linearRampToValueAtTime(0.0, context.currentTime + decays[i])

            // connect nodes
            o.connect(g);
            g.connect(context.destination);

            // edge case
            if (!o.start)
              o.start = o.noteOn;
            o.start(0);    

        };

    }

   playSound(700);
};