# Who is Sylvia ?
[![Code Climate](https://codeclimate.com/github/TinyMan/node-sylvia/badges/gpa.svg)](https://codeclimate.com/github/TinyMan/node-sylvia)

Sylvia is a phone controller designed for Raspberry pi. It uses Serial port and AT Commands to control a gprs hat.

I'm using [Sixfab GPRS](http://sixfab.com/product/gsmgprs-shield/) but it may work with others.

Sylvia supports:

* sending sms (1 part max)
* receiving sms (multiparts is ok)
* multiple encoding of sms
* make calls and answer them (audio is not stable)
* Caller ID Presentation (clip event)

Future support:
* sending multipart sms
* connecting audio with better quality (probably bluetooth)
* types declaration

# Installation

`npm install sylvia`

# Requirements
* Node >= 8
* Linux
* GSM modem

