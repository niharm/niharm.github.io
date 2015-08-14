10 => int num_partials;
SinOsc s[num_partials]; 
ADSR e[num_partials]; 
[525.55, 1685.89, 3805.17, 5968.91, 6297.97, 8634.46, 9605.04, 11767.90, 12201.99, 12423.24] @=> float freqs[];
[.026, .015, .394, .065, .254, .280, .05, .03, .03, .028] @=> float amps [];
[4.7, 2, 1.2, 2, .8, 1.1, .9, .5, .95, .55] @=> float decays [];

for (0 => int i; i < num_partials; i++) {
 s[i] => e[i] => dac;   
 s[i].freq(freqs[i] * 1);
 s[i].gain(amps[i] * 0.1);
 e[i].set(5::ms, decays[i]::second, 0.0, 0::ms);
 e[i].keyOn();
}


5::second => now;