SHELL = /bin/bash
export PATH := ./node_modules/.bin/:${PATH}

MAKEFLAGS += --no-print-directory --silent

clean:
	rm -rf build/ \
		npm-debug.log
lint:
		eslint lib/
test: clean lint
	mocha --exit --reporter spec $(MOCHAFLAGS)

version:
	node -e "console.log(require('./package.json').version)"

release: 
	npm run build