var ax, ay, az;

function move(event) {
	ax = Math.round(Math.abs(event.accelerationIncludingGravity.x * 1));
	ay = Math.round(Math.abs(event.accelerationIncludingGravity.y * 1));
	az = Math.round(Math.abs(event.accelerationIncludingGravity.z * 1));
};