import com.manydesigns.portofino.dispatcher.NodeWithParameters;

import javax.ws.rs.GET;
import javax.ws.rs.Produces;
import javax.ws.rs.core.MediaType;
import java.util.List;

public class Params extends NodeWithParameters {
    
    public Params() {
        minParameters = 1;
        maxParameters = 2;
    }
    
    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public List<String> getParameters() {
        parametersAcquired();
        return parameters;
    }
    
}