
			// Position Variables
			var ax, ay, az;
			var dax = 0;
			var day = 0;
			var daz = 0;
			var previousAx = 0,
				previousAy = 0,
				previousAz = 0;

			// Acceleration
			var delay = 300;

			var bell = document.getElementById("bell");

			setInterval(function() {

			if (window.DeviceMotionEvent==undefined) {
				console.log('no motion')
			} 

			else {
				window.ondevicemotion = function(event) {

					ax = Math.round(Math.abs(event.accelerationIncludingGravity.x * 1));
					ay = Math.round(Math.abs(event.accelerationIncludingGravity.y * 1));
					az = Math.round(Math.abs(event.accelerationIncludingGravity.z * 1));		

					rR = event.rotationRate;
					if (rR != null) {
						arAlpha = Math.round(rR.alpha);
						arBeta = Math.round(rR.beta);
						arGamma = Math.round(rR.gamma);
					}
	
				}
		


					dax = previousAx - ax;
					day = previousAy - ay;
					daz = previousAz - az;	

					previousAx = ax;
					previousAy = ay;
					previousAz = az;



					// TODO: Fix this function neatness, compactness

					// check shake 
					var shake = dax * dax + day * day + daz * daz;
					if (shake > 50) {
						console.log(shake);

						// play bell if currently colored
						if (document.bgColor == "FF0000") {
							Bell(1, shake);
						}

						if (document.bgColor == "0000FF") {
							Bell(1.25, shake);
						}

						if (document.bgColor == "00FF00") {
							Bell(1.33, shake);
						}

						if (document.bgColor == "990066") {
							Bell(1.5, shake);
						}
					}
				}

				
				}, delay);