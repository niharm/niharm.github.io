var code = "3 => int num_partials;\nSinOsc s[num_partials]; \nADSR e[num_partials]; \n[525.55, 1685.89, 3805.17, 5968.91, 6297.97, 8634.46, 9605.04, 11767.90, 12201.99, 12423.24] @=> float freqs[];\n[.026, .015, .394, .065, .254, .280, .05, .03, .03, .028] @=> float amps [];\n[4.7, 2, 1.2, 2, .8, 1.1, .9, .5, .95, .55] @=> float decays [];\n\nfor (0 => int i; i < num_partials; i++) {\n s[i] => e[i] => dac;   \n s[i].freq(freqs[i] * 1);\n s[i].gain(amps[i] * 0.1);\n e[i].set(5::ms, decays[i]::second, 0.0, 0::ms);\n}\n\nfor (0 => int i; i < num_partials; i++) {\n e[i].keyOn();\n}\n\n5::second => now;"