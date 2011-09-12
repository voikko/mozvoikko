

mozvoikko2:
	rm -vf mozvoikko2.xpi
	zip -9 mozvoikko2.xpi README COPYING install.rdf chrome.manifest \
		components/MozVoikko2.js \
		$(shell find voikko -type f)
