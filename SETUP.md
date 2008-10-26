Setting up XMPP
===============

### Setup ejabberd

#### Mac

Obtain the [dmg installer][http://www.process-one.net/en/ejabberd/downloads/]

#### Linux

Use the package manager to install erlang and related dependencies. Then install ejabberd version 2.0 or greater. Use a package manager or build from source.

    sudo vi /etc/ejabberd/ejabberd.cfg 

and modify the following:
    
    {acl, admin, {user, "myadmin_username_here", "localhost"}}.

then add the user via the command-line:

    sudo /etc/init.d/ejabberd start
    sudo ejabberdctl register myadmin_username_here localhost myadmin_password_here
    sudo /etc/init.d/ejabberd restart

Browse to http://localhost:5280/admin to verify the server is running.

Now we need to setup http binding.

    sudo vi /etc/ejabberd/ejabberd.cfg

Add the following to the modules section:

    {mod_http_bind, []}

Add the http_bind service

    {5280, ejabberd_http, [
                            http_poll,
                            web_admin,
                            http_bind
                          ]}

Restart the ejabberd server and browse to http://localhost:5280/http-bind/ to verify the service is running.

References:
[http://www.ostinelli.net/2008/04/28/how-to-install-ejabberd-200-with-postgresql-support]
[http://wiki.contribs.org/Ejabberd]

### Modify web server for proxy pass

#### Nginx
Add the following under a server entry in the nginx conf file.   

    location /http-bind {
      proxy_pass http://localhost:5280/http-bind;
      proxy_read_timeout 300;
    }

#### Apache
Add the following to the httpd.conf

    <VirtualHost *>
      Servername example.com
      DocumentRoot /path/to/site/root
      AddDefaultCharset UTF-8
      RewriteEngine On
      RewriteRule ^/http-bind http://localhost:5280/http-bind [P]
    </VirtualHost>

Make sure the following lines are uncommented

    LoadModule rewrite_module     libexec/httpd/mod_rewrite.so
    LoadModule proxy_module       libexec/httpd/libproxy.so
    AddModule mod_rewrite.c
    AddModule mod_proxy.c

It may be necessary to add the ProxyTimeout directive to the Apache configs though the value should be 300 by default.
[1]: http://httpd.apache.org/docs/2.0/mod/mod_proxy.html#proxytimeout

