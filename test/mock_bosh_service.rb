require 'test/unit'
require 'webrick'
require 'thread'

class ::WEBrick::HTTPServer
  def access_log(config, req, res)
    # nop
  end
end

class ::WEBrick::BasicLog
  def log(level, data)
    # nop
  end
end

class BoshService < ::WEBrick::HTTPServlet::AbstractServlet
  def do_POST(req, res)
    res.status = 200
    res.body = %Q(<body xmlns="http://jabber.org/protocol/httpbind"/>)
    res['Content-Type'] = "text/xml"
  end
end

port = 5280
path = "/http-bind/"
server = WEBrick::HTTPServer.new( :Port => port, :ServerType => WEBrick::Daemon )
server.mount(path, BoshService)

trap("INT") {
  server.shutdown
  exit
}

puts "=> Webrick started on http://localhost#{path}:#{port}"

server.start