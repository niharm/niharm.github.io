
			// Position Variables
			var ax, ay, az;
			var dax = 0;
			var day = 0;
			var daz = 0;
			var previousAx = 0,
				previousAy = 0,
				previousAz = 0;

			// Accelerations
			var delay = 10;

			var bell = document.getElementById("bell");

			if (window.DeviceMotionEvent==undefined) {
				console.log('no motion')
			} 

			else {
				window.ondevicemotion = function(event) {
					ax = Math.round(Math.abs(event.accelerationIncludingGravity.x * 1));
					ay = Math.round(Math.abs(event.accelerationIncludingGravity.y * 1));
					az = Math.round(Math.abs(event.accelerationIncludingGravity.z * 1));
				}

			}
			setInterval(function() {
	
				dax = previousAx - ax;
				day = previousAy - ay;
				daz = previousAz - az;

				previousAx = ax;
				previousAy = ay;
				previousAz = az;

				// check shake 
				var shake = dax * dax + day * day + daz * daz;

				if (shake > 40) {

					document.getElementById("dax").innerHTML = dax;
					document.getElementById("day").innerHTML = day;
					document.getElementById("daz").innerHTML = daz;
					document.getElementById("ax").innerHTML = ax;
					document.getElementById("ay").innerHTML = ay;
					document.getElementById("az").innerHTML = az;
					document.getElementById("shake").innerHTML = shake;

					Noise(Math.abs(dax), Math.abs(day), Math.abs(daz));
				
			}
			
	}, delay);
