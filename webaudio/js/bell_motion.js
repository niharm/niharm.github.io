var bellMotion;

function startBellMotion() {

	// Position Variables
	var dax = 0;
	var day = 0;
	var daz = 0;
	var previousAx = 0,
		previousAy = 0,
		previousAz = 0;

	// Acceleration
	var bellDelay = 10;
	var bellFrequency;

	bellMotion = setInterval(function() {

		dax = previousAx - ax;
		day = previousAy - ay;
		daz = previousAz - az;	

		previousAx = ax;
		previousAy = ay;
		previousAz = az;


		// check shake 
		var shake = dax * dax + day * day + daz * daz;
		if (shake > 10) {

				bellFrequency = 587.33;

			if (!currentlyPlayingBell) {
				Bell(bellFrequency, Math.abs(dax), Math.abs(day), Math.abs(daz));
			}
		}

	}, bellDelay);
};

function stopBellMotion() {
	clearInterval(bellMotion);
}