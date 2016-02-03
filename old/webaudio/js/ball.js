var cssPropNamePrefixes = ['O', 'MS', 'Moz', 'Webkit'];




function getCSSPropertyName(cssDefaultPropName) {
	var cssPropNameSuffix = '';
	var propNameParts = cssDefaultPropName.split('-');
	for(var i = 0, l = propNameParts.length; i< l; i++) {
		cssPropNameSuffix += propNameParts[i].charAt(0).toUpperCase() + propNameParts[i].slice(1);
	}

	var el = document.createElement('div');
	var style = el.style;
	for (var i = 0, l = cssPropNamePrefixes.length; i < l; i++) {
		var cssPrefixedPropName = cssPropNamePrefixes[i] + cssPropNameSuffix;
		if( style[ cssPrefixedPropName ] !== undefined ) {
			return cssPrefixedPropName;
		}
	}
  return cssDefaultPropName; // fallback to standard prop name
}

// Usage:
//var transformCSSPropName = getCSSPropertyName('transform');


var tiltHue;


var box;
var stop = false;

var TILT_LIMIT = 90;

var screenWidth = window.innerWidth;
var screenHeight = window.innerHeight;

var halfScreenWidth = screenWidth / 2;
var halfScreenHeight = screenHeight / 2;

var cubeWidth;

if (screenWidth < screenHeight) {
	cubeWidth = screenWidth / 4;
} else {
	cubeWidth = screenHeight / 4;
}

var halfCubeWidth = cubeWidth / 2;

var box = document.querySelector('#floatingCircle');

box.style.width = cubeWidth + 'px';
box.style.height = cubeWidth + 'px';

box.minBoundX = box.parentNode.offsetLeft;
box.minBoundY = box.parentNode.offsetTop;


box.maxBoundX = box.minBoundX + box.parentNode.offsetWidth - box.offsetWidth;
box.maxBoundY = box.minBoundY + box.parentNode.offsetHeight - box.offsetHeight;

var initialBeta;
var transformCSSPropName = getCSSPropertyName('transform');


function ball() {

	var promise = FULLTILT.getDeviceOrientation({'type': 'game'});

	promise.then(function(orientationControl) {

		orientationControl.listen(function() {


			if (stop) {
				orientationControl.stop();
			}

			var euler;

			matrix = orientationControl.getScreenAdjustedMatrix();

			var tilt = - matrix.elements[8];
			var turn = matrix.elements[2];

			// if status is 1, handle colors here. otherwise, handle in noise_motion.js
			if (status == 1) {
				// converts -1 to 1 to 0 to 240 hues
				tiltHue = parseInt((turn + 1)/2.0 * 240);
				$('.colors').css('background-color',  "hsl(" + tiltHue + ", 100%, 50%)");
			}

			turn = 90 * turn;
			tilt = 90 * tilt;

			if (turn > 0) {
				turn = Math.min(turn, TILT_LIMIT);
			} else {
				turn = Math.max(turn, TILT_LIMIT * -1);
			}

			var pxOffsetX = (turn * halfScreenWidth) / TILT_LIMIT;

			if (tilt > 0) {
				tilt = Math.min(tilt, TILT_LIMIT);
			} else {
				tilt = Math.max(tilt, TILT_LIMIT * -1);
			}

			var pxOffsetY = (tilt * halfScreenHeight) / TILT_LIMIT;

			var pxToMoveX = pxOffsetX + halfScreenWidth - halfCubeWidth;
			var pxToMoveY = pxOffsetY + halfScreenHeight - halfCubeWidth;




			box.style[transformCSSPropName] = 'translate3d(' + pxToMoveX + 'px, ' + pxToMoveY + 'px, 0)';

		});


});


};

function startBall() {
	stop = false;
};

function stopBall() {
	stop = true;
};

window.addEventListener('resize', function() {

	// Recalculate screen dimensions

	screenWidth = window.innerWidth;
	screenHeight = window.innerHeight;

	halfScreenWidth = screenWidth / 2;
	halfScreenHeight = screenHeight / 2;

	// Recalculate min/max X/Y bounds

	box.minBoundX = box.parentNode.offsetLeft;
	box.minBoundY = box.parentNode.offsetTop;

	box.maxBoundX = box.minBoundX + box.parentNode.offsetWidth - box.offsetWidth;
	box.maxBoundY = box.minBoundY + box.parentNode.offsetHeight - box.offsetHeight;

	// Clear default beta offset from zero

	initialBeta = null;

}, false);
