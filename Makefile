
VERSION=2.0

XPI_FILES=README COPYING install.rdf chrome.manifest components/MozVoikko2.js
SOURCE_FILES=$(XPI_FILES) Makefile

.PHONY: dist-gzip mozvoikko2 clean all

all: mozvoikko2

dist-gzip: mozvoikko-$(VERSION).tar.gz

mozvoikko-$(VERSION).tar.gz: $(patsubst %,mozvoikko-$(VERSION)/%, $(sort $(SOURCE_FILES)))
	tar c --group 0 --owner 0 mozvoikko-$(VERSION) | gzip -9 > $@

$(patsubst %,mozvoikko-$(VERSION)/%, $(sort $(SOURCE_FILES))): mozvoikko-$(VERSION)/%: %
	install -m 644 -D $^ $@

mozvoikko2:
	rm -vf mozvoikko2.xpi
	zip -9 mozvoikko2.xpi $(XPI_FILES) $(shell find voikko -type f '!' -name '.*' '!' -path 'voikko*/.*')

clean:
	rm -f mozvoikko-$(VERSION).tar.gz mozvoikko2.xpi
	rm -f $(patsubst %,mozvoikko-$(VERSION)/%, $(sort $(SOURCE_FILES)))
	test -d mozvoikko-$(VERSION)/components && rmdir mozvoikko-$(VERSION)/components
	test -d mozvoikko-$(VERSION) && rmdir mozvoikko-$(VERSION)
