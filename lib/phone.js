const SerialPort = require('serialport')
const Readline = SerialPort.parsers.Readline;
const EventEmitter = require('events')
const parsePdu = require('pdu').parse
const nodePdu = require('node-pdu')
const util = require('util')

const parseSms = (() => {
	let parts = {}
	return function parseSms(data) {
		try {
			const matches = /\+(?:CMGR)|(?:CMT):.+\r((?:[\r\n]|.)+)\r(?:OK\r)?$/.exec(data)
			const pdu = parsePdu(matches[1])
			pdu.text = pdu.text.replace(/\0/g, '')
			if (pdu.udh) { // multipart sms
				const ref = pdu.udh.reference_number
				const total = pdu.udh.parts
				if (ref in parts) {
					parts[ref].push(pdu)
					let ok = true
					let i = 1
					while (ok && i <= total) {
						ok = parts[ref].find(e => e.udh.current_part === i)
						i++
					}
					if (ok) {
						// reassemble						
						const full = parts[ref].reduce((acc, val) => {
							acc.text += val.text
							return acc
						}, parts[ref][0])
						delete parts[ref]
						delete full['udh']
						return full
					} else {
						return null
					}
				} else {
					parts[ref] = [pdu]
				}
			} else return pdu
		} catch (e) {
			throw new Error("Cannot parse sms", e)
		}
	}
})()
function parseClip(data) {
	try {
		return /\+CLIP: "([^"]+)"/.exec(data)[1]
	} catch (e) { return "" }
}
class SylviaPhone extends EventEmitter {
	constructor(serialPath = "/dev/serial0", pin = "1234") {
		super()
		this.serialPath = serialPath
		this.pin = pin
		this.started = false
		this.parser = new Readline();
		this.serial = new SerialPort(this.serialPath, { autoOpen: false, baudRate: 115200, dataBits: 8, stopBits: 1 })
		this.serial.pipe(this.parser)
		this.parser.on('data', this._onData.bind(this))
		this._serialWrite = util.promisify(this.serial.write.bind(this.serial))
		this._serialOpen = util.promisify(this.serial.open.bind(this.serial))

		this.smsReady = false
		this.callReady = false
		this._endTransmission = null
		this._reading = null
		this._buf = ''
		this._lastLine = ''
	}
	async stop() {
		try {
			await util.promisify(this.serial.close.bind(this.serial))
		} catch (e) {
			this.emit('error', e)
		}
	}
	async start() {
		try {
			await this._serialOpen()

			await this._serialWrite('AT\r')
			await this._serialWrite('AT+COLP=1\r')
			await this._serialWrite('AT+QAUDCH=1\r')
			await this._serialWrite('AT+CMEE=2\r')
			await this._serialWrite('AT+CLIP=1\r')
			await this._serialWrite('AT+CNMI=2,2,0,1,1\r')
			await this._serialWrite('AT+CPIN="' + this.pin + '"\r')
		} catch (e) {
			this.emit('error', e)
		}

	}
	async sendSms(message, num) {
		try {
			await this._serialWrite('AT+CSQ\r')
			await this._serialWrite('AT+CMGF=0\r')
			const pdu = nodePdu.Submit()
			pdu.setAddress(num)
			pdu.setData(message)
			pdu.getType().setSrr(1);
			const parts = pdu.getParts();
			for (let i = 0; i < parts.length; i++) {
				const part = parts[i]
				const sms = part.toString()
				await this._serialWrite('AT+CMGS=' + ((sms.length / 2) - 1) + '\r')
				await this._serialWrite(sms + '\x1A')
			}
		} catch (e) {
			this.emit('error', e)
		}
	}
	async readSms(id) {
		await this._serialWrite('AT+CMGF=0\r')
		await this._serialWrite('AT+CMGR=' + id + '\r')
		return await new Promise((resolve, reject) => {
			this._onReadEnd = sms => {
				sms = parseSms(sms)
				if (sms) resolve(sms)
			}
		})
	}
	async _onSms(data) {
		const sms = parseSms(data)
		if (sms) this.emit('sms', sms)
	}
	async answer() {
		await this._serialWrite('ATA\r')
		this.emit('answer')
	}
	async hangup() {
		await this._serialWrite('ATH\r')
	}
	async dial(num) {
		await this._serialWrite('ATD' + num + ';\r')
	}
	async _onData(data) {
		try {
			this.emit('serial-msg', data)
			if (this._reading) {
				// read only 1 line
				this._buf += data
				if (this._onReadEnd) await this._onReadEnd(this._buf)
				this._reading = null
				this._buf = ''
			} else {
				if (data === "SMS Ready")
					this.smsReady = true
				if (data === "Call Ready")
					this.callReady = true

				const matches = /^\+CMTI: "SM",(\d+)/.exec(data)
				if (matches)
					this._onReceiveSms(matches[1])
				else if (/^\+CMGR: /.test(data)) {
					this._reading = 'sms';
					this._buf = data
				} else if (/^\+CME ERROR:/.test(data))
					this.emit('error', data)
				else if (/^RING\r/.test(data))
					this.emit('ring')
				else if (/^NO CARRIER\r/.test(data))
					this.emit('hangup')
				else if (/^\+CLIP:/.test(data)) {
					this.emit("clip", parseClip(data))
				} else if (/^\+CMT:/.test(data)) {
					this._reading = 'sms'
					this._buf = data
					this._onReadEnd = this._onSms.bind(this)
				} else if (/^\+CMGS: \d+/.test(data)) {
					this.emit('sms-sent', data.match(/\d+/))
				} else if (/^\+CDS:/.test(data)) {
					// report status
				}
			}
			if (this._empty && /^OK/.test(data)) {
				if (this._reading) {
					if (this._onReadEnd) await this._onReadEnd(this._buf)
					this._reading = null
					this._buf = ''
				}
				this.emit('ok')
			}
			this._empty = /^\r?\n?$/.test(data)
		} catch (e) {
			this.emit('error', e)
		}
	}
	async _onReceiveSms(id) {
		const sms = await this.readSms(id)
		this.emit('sms', sms)
	}
}

module.exports = SylviaPhone