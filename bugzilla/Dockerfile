# Bugzilla 5.2 with this repository's extensions and templates.
# Build:  docker build -t bugtracker-bugzilla ./bugzilla
# Settings come from environment variables at start-up (see docker/entrypoint.sh); none are baked in.
#
# System packages and CPAN modules are the ones Bugzilla's own Dockerfile installs
# (github.com/bugzilla/bugzilla, tag bugzilla-5.2).
FROM ubuntu:22.04

ARG BUGZILLA_TAG=bugzilla-5.2
ENV DEBIAN_FRONTEND=noninteractive \
    PERL_MM_USE_DEFAULT=1

RUN apt-get update && apt-get -y dist-upgrade && apt-get -y install \
      apache2 mariadb-client netcat-traditional git ca-certificates \
      libappconfig-perl libdate-calc-perl libtemplate-perl build-essential \
      libdatetime-timezone-perl libdatetime-perl libemail-address-perl libemail-sender-perl \
      libemail-mime-perl libemail-mime-modifier-perl libdbi-perl libdbix-connector-perl \
      libcgi-pm-perl liblocale-codes-perl libmath-random-isaac-perl libmath-random-isaac-xs-perl \
      libapache2-mod-perl2 libapache2-mod-perl2-dev libchart-perl libxml-perl libxml-twig-perl \
      perlmagick libgd-graph-perl libtemplate-plugin-gd-perl libsoap-lite-perl libhtml-scrubber-perl \
      libjson-rpc-perl libdaemon-generic-perl libtheschwartz-perl libtest-taint-perl \
      libauthen-radius-perl libfile-slurp-perl libencode-detect-perl libmodule-build-perl \
      libnet-ldap-perl libauthen-sasl-perl libfile-mimeinfo-perl libhtml-formattext-withlinks-perl \
      libgd-dev libmysqlclient-dev graphviz \
 && rm -rf /var/lib/apt/lists/*

# Ubuntu 22.04 ships versions of these that are too old for Bugzilla 5.2.
RUN cpan install Template::Toolkit Email::Address::XS Email::Sender DBD::MariaDB

# Unmodified upstream Bugzilla.
RUN git clone --depth 1 --branch "${BUGZILLA_TAG}" https://github.com/bugzilla/bugzilla.git /var/www/html \
 && cd /var/www/html \
 && rm -rf .git docker Dockerfile* docker-compose.yml data localconfig index.html \
 && mkdir data

# This repository's customisations on top.
COPY extensions/ /var/www/html/extensions/
COPY templates/en/custom/ /var/www/html/template/en/custom/
COPY setup/ /opt/bugtracker/setup/
COPY admin/ /opt/bugtracker/admin/

COPY docker/apache-bugzilla.conf /etc/apache2/sites-available/000-default.conf
COPY docker/entrypoint.sh /usr/local/bin/bugzilla-entrypoint
RUN chmod 755 /usr/local/bin/bugzilla-entrypoint \
 && chown -R root:www-data /var/www/html \
 && a2enmod expires headers rewrite \
 && a2dismod mpm_event && a2enmod mpm_prefork

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 CMD nc -z 127.0.0.1 80 || exit 1

ENTRYPOINT ["/usr/local/bin/bugzilla-entrypoint"]
