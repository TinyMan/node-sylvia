const spawn = require('child_process').spawn
const PassThrough = require('stream').PassThrough;

var ps = null;

var audio = new PassThrough;
var info = new PassThrough;

function start(options) {
	options = Object.assign({
		device: "plughw:0,0",
		channels: 1,
		rate: 48000,
		samples: 'S16_LE',
		moreOptions: []
	}, options);

	if (ps === null) {
		ps = spawn('arecord', ['-D', options.device, '-c', options.channels, '-r', options.rate, '-f', options.samples, ...options.moreOptions]);

		ps.stdout.pipe(audio);
		ps.stderr.pipe(info);
	}
}
function stop() {
	if (ps) {
		ps.kill();
		ps = null;
	}
}

exports.audioStream = audio;
exports.infoStream = info;
exports.startCapture = start;
exports.stopCapture = stop;